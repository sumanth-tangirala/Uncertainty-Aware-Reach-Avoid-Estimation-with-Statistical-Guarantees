/* Paper website: math rendering, the data-budget explorer, the results table, the BibTeX copy button.
   All numbers come from assets/explorer/data.js (window.SITE_DATA), which is generated; nothing is typed here. */
(function () {
  'use strict';

  var D = window.SITE_DATA;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ------------------------------------------------------------------ math */
  function tex(s, display) {
    if (window.katex) {
      try { return window.katex.renderToString(s, { throwOnError: false, displayMode: !!display }); } catch (e) { /* fall through */ }
    }
    return '<span>' + esc(s) + '</span>';
  }
  /* a formula and the punctuation mark after it stay on one line */
  function texp(s, punct) { return '<span class="tex">' + tex(s) + (punct || '') + '</span>'; }
  Array.prototype.forEach.call(document.querySelectorAll('.tex[data-tex]'), function (n) {
    n.innerHTML = tex(n.getAttribute('data-tex'), n.hasAttribute('data-display'));
    var nx = n.nextSibling, pv = n.previousSibling;
    if (nx && nx.nodeType === 3 && /^\)?[.,;:]?/.test(nx.nodeValue)) {
      var tail = nx.nodeValue.match(/^\)?[.,;:]?/)[0];
      if (tail) { n.appendChild(document.createTextNode(tail)); nx.nodeValue = nx.nodeValue.slice(tail.length); }
    }
    if (pv && pv.nodeType === 3 && /\($/.test(pv.nodeValue)) {
      n.insertBefore(document.createTextNode('('), n.firstChild);
      pv.nodeValue = pv.nodeValue.slice(0, -1);
    }
  });

  /* method names are set in a typewriter face, the prefix and suffix are not */
  function methodName(s) { return esc(s).replace(/\b(PARSE|PAR)\b/g, '<span class="mn">$1</span>'); }

  /* counts as in the paper's figures: 100, 500, 1K, 1.5K, 12K */
  function countLabel(n) {
    if (n < 1000) return String(n);
    var k = n / 1000;
    return (Math.round(k * 100) / 100) + 'K';
  }
  function pct(v, digits) { return v == null ? '–' : v.toFixed(digits == null ? 1 : digits); }

  var REC_S = '\\widehat{\\mathrm{Rec}}_{\\mathrm{s}}', REC_F = '\\widehat{\\mathrm{Rec}}_{\\mathrm{f}}';
  var ERR_S = '\\widehat{\\mathrm{Err}}_{\\mathrm{s}}', ERR_F = '\\widehat{\\mathrm{Err}}_{\\mathrm{f}}';
  var ABST = '\\widehat{\\mathrm{Abst}}';
  var METRICS = [
    { key: 'rec_s', tex: REC_S, what: 'success recall', cls: 's', color: 'var(--c-success)', err: false },
    { key: 'err_s', tex: ERR_S, what: 'success prediction error', cls: 's', color: 'var(--c-success)', err: true },
    { key: 'rec_f', tex: REC_F, what: 'failure recall', cls: 'f', color: 'var(--c-failure)', err: false },
    { key: 'err_f', tex: ERR_F, what: 'failure prediction error', cls: 'f', color: 'var(--c-failure)', err: true },
    { key: 'abst', tex: ABST, what: 'abstention', cls: 'a', color: 'var(--c-abst)', err: false }
  ];
  var ARMS = [
    { id: 'adaptive', name: '<span class="mn">PARSE</span>', sub: 'adaptive sampling', dash: '' },
    { id: 'uniform', name: 'Unif-<span class="mn">PARSE</span>', sub: 'uniform sampling', dash: '6.4 2.6 1.8 2.6' }
  ];

  function seg(container, items, current, onPick) {
    container.innerHTML = '';
    items.forEach(function (it, i) {
      var b = el('button', null, it.html);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', i === current ? 'true' : 'false');
      if (it.title) b.title = it.title;
      b.addEventListener('click', function () { onPick(i); });
      container.appendChild(b);
    });
  }
  function settingItems(list) {
    return list.map(function (s) { return { html: esc(s.title) + ' <span class="dim">(' + s.dim + 'D)</span>' }; });
  }

  /* ================================================================== explorer */
  function explorer() {
    var root = $('#ex');
    if (!D || !root) return;
    var settings = D.settings.filter(function (s) { return s.planes.length > 0; });
    if (!settings.length) return;
    root.hidden = false;
    if (D.preview) $('#ex-preview').hidden = false;

    var NR = D.rounds;
    var state = { si: 0, pi: 0, seed: 0, round: NR - 1, starts: false };
    var timer = null;
    var images = {};

    function load(name) {
      if (!images[name]) {
        images[name] = new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = function () { rej(new Error('could not load ' + name)); };
          im.src = 'assets/explorer/maps/' + name;
        });
      }
      return images[name];
    }
    function cur() {
      var S = settings[state.si];
      return { S: S, P: S.planes[state.pi], seed: String(D.seeds[state.seed]) };
    }

    /* ---- static structure of the two prediction panels */
    var panels = {};
    ARMS.forEach(function (arm) {
      var fig = $('#ex-map-' + arm.id);
      fig.innerHTML =
        '<figcaption><span class="map-name">' + arm.name + '</span><span class="map-sub">' + arm.sub + '</span><span class="chip"></span></figcaption>' +
        '<div class="map-plot"><div class="ylab"></div><div class="yaxis"></div>' +
        '<div class="map-frame"><canvas></canvas>' +
        '<svg class="overlay ov-b" preserveAspectRatio="none"><path class="bnd"></path></svg>' +
        '<svg class="overlay ov-s"></svg>' +
        '<div class="map-msg" hidden><strong>Abstains everywhere</strong>No threshold setting passed the calibration test at this budget.</div></div>' +
        '<div class="xaxis"></div></div>' +
        '<dl class="stats">' + METRICS.map(function (m) {
          return '<div class="stat ' + m.cls + '"><dt>' + tex(m.tex) + '</dt><dd data-k="' + m.key + '">–</dd></div>';
        }).join('') + '</dl><p class="stats-cap"></p>';
      panels[arm.id] = {
        fig: fig, canvas: $('canvas', fig), bnd: $('.bnd', fig), ovb: $('.ov-b', fig), ovs: $('.ov-s', fig),
        yaxis: $('.yaxis', fig), xaxis: $('.xaxis', fig), ylab: $('.ylab', fig), chip: $('.chip', fig), cap: $('.stats-cap', fig),
        msg: $('.map-msg', fig)
      };
      panels[arm.id].canvas.setAttribute('role', 'img');
    });
    var gtCanvas = $('#ex-gt'), gtOv = $('#ex-gt-ov');
    gtOv.setAttribute('preserveAspectRatio', 'none');
    gtOv.innerHTML = '<path class="bnd"></path>';
    gtCanvas.style.imageRendering = 'auto';

    /* ---- axis ticks */
    function ticks(lo, hi, unit) {
      var span = hi - lo, eps = span * 0.02, out = [], pi = Math.PI;
      var isPi = unit.indexOf('rad') === 0 && Math.abs(lo / pi - Math.round(lo / pi)) < 0.03 && Math.abs(hi / pi - Math.round(hi / pi)) < 0.03;
      var step, v, k;
      if (isPi) {
        step = span > 3.5 * pi ? 2 * pi : pi;
        for (k = Math.ceil((lo - eps) / step); k * step <= hi + eps; k++) {
          var m = Math.round(k * step / pi);
          out.push({ v: Math.min(hi, Math.max(lo, k * step)), t: m === 0 ? '0' : (m < 0 ? '−' : '') + (Math.abs(m) === 1 ? '' : Math.abs(m)) + 'π' });
        }
        return out;
      }
      var raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
      step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
      for (k = Math.ceil((lo - eps) / step); k * step <= hi + eps; k++) {
        v = k * step;
        var a = Math.abs(v), d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
        out.push({ v: Math.min(hi, Math.max(lo, v)), t: (v < -1e-9 ? '−' : '') + a.toFixed(d) });
      }
      return out;
    }
    function axisLabel(sym, unit) {
      var word = /^\\text\{(.*)\}$/.exec(sym);          /* a label in words is set in the page's own face */
      return '<span class="axis-lab">' + (word ? esc(word[1]) : tex(sym)) + ' (' + esc(unit) + ')</span>';
    }

    /* ---- map geometry: integer cell sizes, so every cell has the same width and height */
    function geometry(P) {
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      var avail = Math.max(120, Math.min(panels.adaptive.fig.clientWidth - 36, 440));
      var kx = Math.max(1, Math.floor(avail * dpr / P.nx));          /* device pixels per cell */
      var W = P.nx * kx / dpr;
      var ky = Math.max(1, Math.round(Math.min(W, 400) * dpr / P.ny));
      return { W: W, H: P.ny * ky / dpr, pw: P.nx * kx, ph: P.ny * ky };
    }

    function drawFrame(canvas, img, frame, P, g) {
      canvas.width = g.pw; canvas.height = g.ph;
      canvas.style.width = g.W + 'px'; canvas.style.height = g.H + 'px';
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, frame * P.nx, 0, P.nx, P.ny, 0, 0, canvas.width, canvas.height);
    }

    /* ---- everything that depends on the setting, slice or window size */
    var token = 0;
    function layout() {
      var c = cur(), S = c.S, P = c.P, my = ++token;
      var names = [P.gt];
      ARMS.forEach(function (a) { D.seeds.forEach(function (s) { names.push(P.sprites[a.id][String(s)]); }); });
      return Promise.all(names.map(load)).then(function () {
        if (my !== token) return;
        var g = geometry(P);
        ARMS.forEach(function (arm) {
          var p = panels[arm.id];
          p.ovb.setAttribute('viewBox', '0 0 ' + P.nx + ' ' + P.ny);
          p.bnd.setAttribute('d', P.boundary);
          p.ovs.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H);
          p.yaxis.style.height = g.H + 'px';
          p.ylab.innerHTML = axisLabel(P.y, P.yu);
          p.xaxis.style.width = g.W + 'px';
          p.yaxis.innerHTML = ticks(P.yr[0], P.yr[1], P.yu).map(function (t) {
            return '<span style="top:' + (100 * (1 - (t.v - P.yr[0]) / (P.yr[1] - P.yr[0]))).toFixed(2) + '%">' + t.t + '</span>';
          }).join('');
          p.xaxis.innerHTML = ticks(P.xr[0], P.xr[1], P.xu).map(function (t) {
            return '<span style="left:' + (100 * (t.v - P.xr[0]) / (P.xr[1] - P.xr[0])).toFixed(2) + '%">' + t.t + '</span>';
          }).join('') + '<span class="xlab">' + axisLabel(P.x, P.xu) + '</span>';
        });
        /* ground-truth thumbnail */
        var tw = Math.min(g.W, 176), th = Math.round(g.H * tw / g.W);
        return load(P.gt).then(function (im) {
          if (my !== token) return;
          gtCanvas.width = P.nx * 2; gtCanvas.height = P.ny * 2;
          gtCanvas.style.width = tw + 'px'; gtCanvas.style.height = th + 'px';
          var ctx = gtCanvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, gtCanvas.width, gtCanvas.height);
          ctx.drawImage(im, 0, 0, P.nx, P.ny, 0, 0, gtCanvas.width, gtCanvas.height);
          gtOv.setAttribute('viewBox', '0 0 ' + P.nx + ' ' + P.ny);
          $('.bnd', gtOv).setAttribute('d', P.boundary);
          $('#ex-axes').innerHTML = 'Horizontal ' + axisLabel(P.x, P.xu) + ', vertical ' + axisLabel(P.y, P.yu) + '. ' +
            ((P.fixed.length || P.fixed_text) ? 'Held fixed: ' + P.fixed.map(function (t) { return texp(t); }).concat(P.fixed_text ? [esc(P.fixed_text)] : []).join(', ') + '.' : 'The whole state space.') +
            ' ' + P.nx + ' × ' + P.ny + ' cells.';
          $('#ex-axes').style.maxWidth = Math.max(tw, 190) + 'px';
          legend(S);
          frame();
        });
      });
    }

    function legend(S) {
      var L = [
        ['<span class="sw" style="background:var(--m-tp)"></span>', 'Correct success (TP)'],
        ['<span class="sw" style="background:var(--m-tn)"></span>', 'Correct failure (TN)'],
        ['<span class="sw" style="background:var(--m-fp)"></span>', 'Wrong success (FP)'],
        ['<span class="sw" style="background:var(--m-fn)"></span>', 'Wrong failure (FN)'],
        ['<span class="sw" style="background:var(--m-abs)"></span>', 'Abstention'],
        ['<span class="sw sw-bnd"></span>', 'Ground-truth boundary']
      ];
      if (S.planes[state.pi].starts && state.starts) {
        L.push(['<span class="sw-dot"></span>', 'Training initial state']);
        L.push(['<span class="sw-dot new"></span>', 'Added in this round']);
      }
      $('#ex-legend').innerHTML = L.map(function (r) { return '<li>' + r[0] + '<span>' + r[1] + '</span></li>'; }).join('');
    }

    /* ---- everything that depends on the round or the seed */
    function frame() {
      var c = cur(), S = c.S, P = c.P, r = state.round, g = geometry(P);
      ARMS.forEach(function (arm) {
        var p = panels[arm.id], row = S.seeds[c.seed][arm.id][r];
        load(P.sprites[arm.id][c.seed]).then(function (im) {
          var now = cur();
          if (now.P !== P || now.seed !== c.seed || state.round !== r) return;
          drawFrame(p.canvas, im, r, P, g);
        });
        p.canvas.setAttribute('aria-label', 'Predictions of ' + (arm.id === 'adaptive' ? 'PARSE' : 'Unif-PARSE') + ' on ' + S.title +
          ' at ' + countLabel(S.train[r]) + ' training trajectories, seed ' + (state.seed + 1));
        METRICS.forEach(function (m) { $('[data-k="' + m.key + '"]', p.fig).textContent = pct(row[m.key]); });
        p.chip.className = 'chip ' + (row.ok ? 'ok' : 'none');
        p.msg.hidden = row.ok;
        p.chip.textContent = row.ok ? 'certified' : 'all-abstain';
        p.chip.title = row.ok ? 'A threshold setting passed the calibration test at this round' :
          'No threshold setting passed the calibration test at this round, so the predictor abstains for every query';
        p.cap.textContent = 'Test set, seed ' + (state.seed + 1) + ', in percent' + (r === 0 ? '. Initial batch: one model for both arms.' : '');
        /* training initial states (pendulum) */
        var html = '';
        if (P.starts && state.starts) {
          var pts = P.starts[arm.id][c.seed], n = S.train[r], n0 = r > 0 ? S.train[r - 1] : n;
          for (var i = 0; i < n; i++) {
            var x = (pts[i][0] - P.xr[0]) / (P.xr[1] - P.xr[0]) * g.W, y = (1 - (pts[i][1] - P.yr[0]) / (P.yr[1] - P.yr[0])) * g.H;
            html += '<circle class="start' + (i >= n0 ? ' new' : '') + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (i >= n0 ? 2.3 : 1.5) + '"></circle>';
          }
        }
        p.ovs.innerHTML = html;
      });
      $('#ex-n').textContent = countLabel(S.train[r]);
      $('#ex-round').textContent = r === 0 ? 'initial batch' : 'after acquisition round ' + r + ' of ' + (NR - 1);
      var sl = $('#ex-slider');
      if (+sl.value !== r) sl.value = r;
      sl.setAttribute('aria-valuetext', countLabel(S.train[r]) + ' training trajectories');
      charts();
    }

    /* ---- controls */
    function controls() {
      var S = settings[state.si];
      seg($('#ex-settings'), settings.map(function (s) { return { html: esc(s.title), title: s.title + ' (' + s.dim + 'D)' }; }), state.si, function (i) {
        state.si = i; state.pi = 0; controls(); layout();
      });
      $('#ex-plane-ctl').hidden = S.planes.length < 2;
      seg($('#ex-planes'), S.planes.map(function (p) { return { html: esc(p.label) }; }), state.pi, function (i) {
        state.pi = i; controls(); layout();
      });
      seg($('#ex-seeds'), D.seeds.map(function (s, i) { return { html: String(i + 1), title: 'Seed ' + s }; }), state.seed, function (i) {
        state.seed = i; controls(); frame();
      });
      $('#ex-starts-ctl').hidden = !S.planes[state.pi].starts;
      var tk = $('#ex-ticks');
      tk.innerHTML = S.train.map(function (n, e) {
        return '<span class="' + (e % 2 ? 'odd' : 'even') + '" style="left:' + (100 * e / (NR - 1)) + '%">' + countLabel(n) + '</span>';
      }).join('');
      var kfmt = function (n) { return n >= 1000 ? countLabel(Math.round(n / 1000) * 1000) : String(n); };
      $('#ex-budget-note').innerHTML = S.title + ' (' + S.dim + 'D). The ' + countLabel(S.n_val) + ' validation states and ' + countLabel(S.n_cal) +
        ' calibration states are separate from the training budget and the same at every round. Test set: ' + kfmt(S.n_test) +
        ' states, ' + Math.round(100 * S.n_succ / S.n_test) + '% success.';
    }
    $('#ex-slider').addEventListener('input', function () { stop(); state.round = +this.value; frame(); });
    $('#ex-starts').addEventListener('change', function () { state.starts = this.checked; legend(settings[state.si]); frame(); });
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      var b = $('#ex-play');
      b.setAttribute('aria-pressed', 'false'); $('.play-text', b).textContent = 'Play';
    }
    $('#ex-play').addEventListener('click', function () {
      if (timer) { stop(); return; }
      if (state.round >= NR - 1) { state.round = 0; frame(); }
      this.setAttribute('aria-pressed', 'true'); $('.play-text', this).textContent = 'Pause';
      timer = setInterval(function () {
        if (state.round >= NR - 1) { stop(); return; }
        state.round += 1; frame();
      }, 900);
    });

    /* ---- charts: one small panel per rate, both arms in each */
    function runs(n, ok) {           /* contiguous index runs where ok(i) holds */
      var out = [], a = -1;
      for (var i = 0; i <= n; i++) {
        var good = i < n && ok(i);
        if (good && a < 0) a = i;
        if (!good && a >= 0) { out.push([a, i - 1]); a = -1; }
      }
      return out;
    }
    function charts() {
      var c = cur(), S = c.S, r = state.round;
      var W = 200, H = 132, ml = 27, mr = 7, mt = 9, mb = 19, pw = W - ml - mr, ph = H - mt - mb;
      var x = function (e) { return ml + (S.train[e] - S.train[0]) / (S.train[NR - 1] - S.train[0]) * pw; };
      var host = $('#ex-charts');
      var html = '';
      METRICS.forEach(function (m) {
        var ymax = 100;
        if (m.err) {
          ymax = 6;
          ARMS.forEach(function (arm) {
            S.curves[arm.id][m.key].forEach(function (p) { if (p.n) ymax = Math.max(ymax, p.max); });
          });
          ymax = ymax > 6 ? Math.ceil(ymax / 5) * 5 : 6;
        }
        var y = function (v) { return mt + (1 - v / ymax) * ph; };
        var yt = m.err ? (ymax > 6 ? [0, 5, ymax] : [0, 5]) : [0, 50, 100];
        var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + m.what + ' over the training budget" data-chart="' + m.key + '">';
        yt.forEach(function (v) {
          s += '<line class="' + (m.err && v === 5 ? 'limit' : 'grid') + '" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"></line>';
          s += '<text x="' + (ml - 4) + '" y="' + (y(v) + 3.3).toFixed(1) + '" text-anchor="end">' + v + '</text>';
        });
        s += '<line class="axis" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (mt + ph) + '" y2="' + (mt + ph) + '"></line>';
        [0, 5, NR - 1].forEach(function (e, i) {
          s += '<text x="' + x(e).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="' + (i === 0 ? 'start' : i === 2 ? 'end' : 'middle') + '">' + countLabel(S.train[e]) + '</text>';
        });
        s += '<line class="guide" x1="' + x(r).toFixed(1) + '" x2="' + x(r).toFixed(1) + '" y1="' + mt + '" y2="' + (mt + ph) + '"></line>';
        ARMS.slice().reverse().forEach(function (arm) {
          var pts = S.curves[arm.id][m.key], sv = S.seeds[c.seed][arm.id];
          var yy = function (v) { return y(Math.min(v, ymax)).toFixed(1); };
          runs(NR, function (i) { return pts[i].n > 0; }).forEach(function (run) {
            var line = '';
            for (var i = run[0]; i <= run[1]; i++) line += (i === run[0] ? 'M' : 'L') + x(i).toFixed(1) + ',' + yy(pts[i].mean);
            s += '<path class="mean" stroke="' + m.color + '"' + (arm.dash ? ' stroke-dasharray="' + arm.dash + '"' : '') + ' d="' + line + '"></path>';
          });
          pts.forEach(function (p, i) {
            if (!p.n) return;
            var op = p.n < D.seeds.length ? ' opacity="0.45"' : '';
            if (arm.id === 'adaptive') s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + yy(p.mean) + '" r="2" fill="' + m.color + '"' + op + '></circle>';
            else s += '<rect x="' + (x(i) - 1.9).toFixed(1) + '" y="' + (+yy(p.mean) - 1.9).toFixed(1) + '" width="3.8" height="3.8" fill="var(--surface)" stroke="' + m.color + '" stroke-width="1"' + op + '></rect>';
          });
          /* the selected seed's line grows with the slider and ends at the marker */
          runs(r + 1, function (i) { return sv[i][m.key] != null; }).forEach(function (run) {
            var line = '';
            for (var i = run[0]; i <= run[1]; i++) line += (i === run[0] ? 'M' : 'L') + x(i).toFixed(1) + ',' + yy(sv[i][m.key]);
            s += '<path class="seed" stroke="' + m.color + '"' + (arm.dash ? ' stroke-dasharray="3 2"' : '') + ' d="' + line + '"></path>';
          });
          if (sv[r][m.key] != null) {
            if (arm.id === 'adaptive') s += '<circle class="now" cx="' + x(r).toFixed(1) + '" cy="' + yy(sv[r][m.key]) + '" r="4" fill="' + m.color + '"></circle>';
            else s += '<rect class="now" x="' + (x(r) - 3.6).toFixed(1) + '" y="' + (+yy(sv[r][m.key]) - 3.6).toFixed(1) + '" width="7.2" height="7.2" fill="var(--surface)" style="stroke:' + m.color + ';stroke-width:2"></rect>';
          }
        });
        if (m.err) {      /* the limit's label sits on a plate above the lines and the cursor */
          s += '<rect x="' + (W - mr - 65) + '" y="' + (y(5) - 12.5).toFixed(1) + '" width="65" height="11.5" fill="var(--surface)"></rect>' +
            '<text x="' + (W - mr - 1.5) + '" y="' + (y(5) - 3.5).toFixed(1) + '" text-anchor="end">5% error limit</text>';
        }
        s += '</svg>';
        html += '<div class="chart"><div class="chart-title">' + tex(m.tex) + '<span class="what" title="' + m.what + ', in percent">' + m.what + ' (%)</span></div>' + s + '</div>';
      });
      host.innerHTML = html;
    }
    function pick(ev) {
      var svg = ev.target.closest ? ev.target.closest('svg[data-chart]') : null;
      if (!svg) return;
      var S = settings[state.si], b = svg.getBoundingClientRect();
      var fx = ((ev.clientX - b.left) / b.width * 200 - 27) / (200 - 27 - 7);
      var want = S.train[0] + fx * (S.train[NR - 1] - S.train[0]), best = 0;
      S.train.forEach(function (n, e) { if (Math.abs(n - want) < Math.abs(S.train[best] - want)) best = e; });
      if (best !== state.round) { stop(); state.round = best; frame(); }
    }
    $('#ex-charts').addEventListener('click', pick);

    $('#ex-chart-legend').innerHTML =
      '<li><svg width="34" height="10" aria-hidden="true"><line x1="1" x2="33" y1="5" y2="5" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="5" r="2.6" fill="currentColor"/></svg><span>' + ARMS[0].name + '</span></li>' +
      '<li><svg width="34" height="10" aria-hidden="true"><line x1="1" x2="33" y1="5" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="6.4 2.6 1.8 2.6"/><rect x="14.5" y="2.5" width="5" height="5" fill="var(--band)" stroke="currentColor"/></svg><span>' + ARMS[1].name + '</span></li>' +
      '<li><span>Thick line: three-seed mean. Thin line ending at the large marker: selected seed, up to the selected budget.</span></li>';

    function budgetHeight() {
      document.documentElement.style.setProperty('--budget-h', $('.ex-budget', root).offsetHeight + 'px');
    }
    var rt = null;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { budgetHeight(); layout(); }, 120); });
    budgetHeight();
    controls();
    layout();
  }

  /* ================================================================== tables of rates, one setting at a time */
  var HEAD5 = [REC_S + '\\uparrow', ERR_S + '\\downarrow', REC_F + '\\uparrow', ERR_F + '\\downarrow', ABST + '\\downarrow'];
  var A05 = '\\alpha_{\\mathrm{s}} = \\alpha_{\\mathrm{f}} = \\delta = 0.05';
  var SHADE = 'For each outcome ' + texp('\\ell', ',') + ' shading marks the row with the lowest ' +
    texp('(1-w)\\,\\widehat{\\mathrm{Err}}_\\ell + w\\,(1-\\widehat{\\mathrm{Rec}}_\\ell)') + ' at ' + texp('w = 0.2', '.');
  var MEANS = 'Entries are mean test percentages over three seeds. A seed with no predictions for an outcome contributes zero recall and is excluded from that outcome\'s error average.';
  var TABLES = {
    main: {
      head: 'Method', group: true,
      modes: [{ key: 'fitted', label: 'Fitted on validation data' }, { key: 'certified', label: 'Certified on calibration data' }],
      cap: {
        fitted: 'Comparison at fitted thresholds (Table 2 of the paper). ' + MEANS + ' ' + SHADE +
          ' A dash means the outcome was never predicted in any seed. DeepReach, Lyapunov NN, MORALS and Part-X are adaptations that use the same validation data and error–recall objective to tune their prediction thresholds.',
        certified: 'Certification of adaptive predictors (Table 3 of the paper) at ' + texp(A05, '.') + ' ' + MEANS + ' Shading as for the fitted thresholds.'
      }
    },
    samples: {
      head: tex('M'), modes: [{ key: 'samples' }],
      cap: { samples: 'Certification of <span class="mn">PAR</span> after adaptive sampling with ' + tex('M') + ' terminal-state predictions per candidate. ' + MEANS + ' ' + SHADE }
    },
    limits: {
      head: 'Limits', modes: [{ key: 'limits' }],
      cap: { limits: 'Certification of <span class="mn">PAR</span> at error limits ' + tex('\\alpha') + ' and confidence parameters ' + texp('\\delta', '.') + ' ' + MEANS +
        ' A dash marks an outcome predicted in no seed. An abstention of 100% means certification returned the all-abstain predictor in every seed. The mark † means the calibration set holds fewer successful states than any threshold setting needs to pass (Appendix A.4).' }
    },
    identical: {
      head: 'Method', modes: [{ key: 'identical' }],
      cap: { identical: 'Certified predictors trained on identical uniform data at the final trajectory budgets. ' + MEANS + ' ' + SHADE + ' A dash means the outcome was never predicted in any seed.' }
    },
    mlp: {
      head: 'Method',
      modes: [{ key: 'mlp_fitted', label: 'Fitted on validation data' }, { key: 'mlp_certified', label: 'Certified on calibration data' }],
      cap: {
        mlp_fitted: 'Comparison of <span class="mn">PAR</span> with its MLP counterparts at fitted thresholds. ' + MEANS + ' ' + SHADE,
        mlp_certified: 'Certification of <span class="mn">PAR</span> and its MLP counterparts at ' + texp(A05, '.') + ' ' + MEANS + ' ' + SHADE
      }
    }
  };
  var PRIOR = { 'DeepReach': 1, 'Lyapunov NN': 1, 'MORALS': 1, 'Part-X GP': 1 };

  function rateTable(root, name, n) {
    var cfg = TABLES[name];
    if (!cfg || !D.tables[cfg.modes[0].key]) return;
    var st = { si: 0, mode: 0 }, id = 'rt' + n;
    root.innerHTML =
      '<div class="ex-controls">' +
      '<div class="ctl"><span class="ctl-label" id="' + id + '-sl">Setting</span><div class="seg" role="radiogroup" aria-labelledby="' + id + '-sl" data-r="settings"></div></div>' +
      (cfg.modes.length > 1 ? '<div class="ctl"><span class="ctl-label" id="' + id + '-ml">Thresholds</span><div class="seg" role="radiogroup" aria-labelledby="' + id + '-ml" data-r="modes"></div></div>' : '') +
      '</div><div class="tbl-scroll"><table></table></div><p class="tbl-cap"></p>';
    root.hidden = false;
    function draw() {
      var S = D.settings[st.si], key = cfg.modes[st.mode].key, rows = D.tables[key][S.id];
      seg($('[data-r="settings"]', root), D.settings.map(function (s) { return { html: esc(s.title), title: s.title + ' (' + s.dim + 'D)' }; }), st.si, function (i) { st.si = i; draw(); });
      if (cfg.modes.length > 1) seg($('[data-r="modes"]', root), cfg.modes.map(function (m) { return { html: m.label }; }), st.mode, function (i) { st.mode = i; draw(); });
      var h = '<thead><tr><th scope="col">' + cfg.head + '</th>' + HEAD5.map(function (t) { return '<th scope="col">' + tex(t) + '</th>'; }).join('') + '</tr></thead><tbody>';
      var prev = null;
      rows.forEach(function (r) {
        var grp = cfg.group ? (PRIOR[r.method] ? 'prior' : /Label|BNN/.test(r.method) ? 'bnn' : 'fm') : null;
        h += '<tr' + (prev && grp !== prev ? ' class="sep"' : '') + '><th scope="row">' + (r.tex ? tex(r.tex) : methodName(r.method)) + '</th>' + r.cells.map(function (c) {
          return '<td class="num' + (c[1] ? ' best' : '') + '">' + esc(c[0]) + (c[2] ? '<sup>†</sup>' : '') + '</td>';
        }).join('') + '</tr>';
        prev = grp;
      });
      $('table', root).innerHTML = h + '</tbody>';
      $('.tbl-cap', root).innerHTML = S.title + ' (' + S.dim + 'D). ' + cfg.cap[key];
    }
    draw();
  }
  function tables() {
    if (!D || !D.tables) return;
    Array.prototype.forEach.call(document.querySelectorAll('.tbl[data-table]'), function (root, n) {
      rateTable(root, root.getAttribute('data-table'), n);
    });
    /* conservative certification: one row per setting */
    var cons = $('#cons-tbl');
    if (cons && D.tables.conservative) {
      var byId = {};
      D.settings.forEach(function (S) { byId[S.id] = S; });
      $('#cons-table').innerHTML = '<thead><tr><th scope="col">Setting</th><th scope="col">' + tex(REC_S + '\\uparrow') + '</th><th scope="col">' + tex(ERR_S + '\\downarrow') + '</th></tr></thead><tbody>' +
        D.tables.conservative.map(function (r) {
          var S = byId[r.setting];
          return '<tr><th scope="row">' + esc(S.title) + ' (' + S.dim + 'D)</th><td class="num">' + esc(r.cells[0]) + '</td><td class="num">' + esc(r.cells[1]) + '</td></tr>';
        }).join('') + '</tbody>';
      cons.hidden = false;
    }
  }

  /* ================================================================== objective-weight figures, one setting at a time */
  function weightFigures() {
    var root = $('#w-fig');
    if (!D || !root) return;
    var FILE = { 'pen-lqr': 'pen_lqr', 'cp-lqr': 'cp_lqr', 'cp-ppo': 'cp_ppo', 'q2d-ppo': 'q2d_ppo', 'q3d-lqr': 'q3d_lqr', 'q3d-ppo': 'q3d_ppo' };
    var cur = 0;
    root.hidden = false;
    function draw() {
      var S = D.settings[cur];
      seg($('#w-settings'), D.settings.map(function (s) { return { html: esc(s.title), title: s.title + ' (' + s.dim + 'D)' }; }), cur, function (i) { cur = i; draw(); });
      $('#w-img').src = 'assets/figures/w_sensitivity_' + FILE[S.id] + '.svg';
      $('#w-cap-setting').textContent = S.title + ' (' + S.dim + 'D)';
    }
    draw();
  }

  /* ================================================================== contents: phone menu and current-section mark */
  function contents() {
    var nav = $('#toc-nav'), pop = $('#toc-pop'), menu = $('#toc-menu');
    if (!nav) return;
    if (pop) {
      pop.innerHTML = nav.innerHTML;
      pop.addEventListener('click', function (ev) { if (ev.target.closest('a')) menu.removeAttribute('open'); });
      document.addEventListener('click', function (ev) { if (menu.hasAttribute('open') && !menu.contains(ev.target)) menu.removeAttribute('open'); });
    }
    var links = Array.prototype.slice.call(document.querySelectorAll('#toc-nav a, #toc-pop a'));
    var ids = [];
    links.forEach(function (l) { var id = l.getAttribute('href').slice(1); if (ids.indexOf(id) < 0 && document.getElementById(id)) ids.push(id); });
    var ticking = false;
    function mark() {
      ticking = false;
      var line = Math.max(96, 0.3 * window.innerHeight), current = ids[0];       /* a reading line 30% down the window */
      for (var i = 0; i < ids.length; i++) {
        if (document.getElementById(ids[i]).getBoundingClientRect().top <= line) current = ids[i];
      }
      links.forEach(function (l) {
        var on = l.getAttribute('href') === '#' + current;
        if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
      });
      var act = $('#toc-nav a[aria-current="true"]'), box = $('#toc');
      if (act && box && box.scrollHeight > box.clientHeight) {
        var r = act.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (r.top < b.top + 8 || r.bottom > b.bottom - 8) box.scrollTop += r.top - b.top - b.height / 2;
      }
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
    window.addEventListener('resize', mark);
    mark();
  }

  /* ================================================================== settings (Table 1) */
  function settingsTable() {
    var root = $('#settings-tbl');
    if (!D || !root) return;
    root.hidden = false;
    var k = function (n) { return n >= 10000 ? Math.round(n / 1000) + 'K' : countLabel(n); };
    var h = '<thead><tr><th scope="col">Setting</th><th scope="col">Dim.</th><th scope="col">Train</th><th scope="col">Val.</th><th scope="col">Cal.</th><th scope="col">Test</th><th scope="col">Success</th></tr></thead><tbody>';
    D.settings.forEach(function (S) {
      h += '<tr><td>' + esc(S.title) + '</td><td class="num">' + S.dim + '</td><td class="num">' + k(S.train[S.train.length - 1]) +
        '</td><td class="num">' + k(S.n_val) + '</td><td class="num">' + k(S.n_cal) + '</td><td class="num">' + k(S.n_test) +
        '</td><td class="num">' + Math.round(100 * S.n_succ / S.n_test) + '%</td></tr>';
    });
    $('#settings-table').innerHTML = h + '</tbody>';
  }

  /* ================================================================== BibTeX */
  function bib() {
    var b = $('#bib-copy'), t = $('#bib-text');
    if (!b || !t) return;
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1600); };
      var fallback = function () {
        var r = document.createRange(); r.selectNodeContents(t);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        b.textContent = 'Selected';
        setTimeout(function () { b.textContent = 'Copy'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.textContent).then(done, fallback);
      else fallback();
    });
  }

  explorer();
  settingsTable();
  tables();
  weightFigures();
  contents();
  bib();
})();
