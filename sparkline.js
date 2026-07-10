/**
 * SparklineJS — A lightweight zero-dependency SVG sparkline & micro-chart library.
 *
 * @author        SparklineJS
 * @license       MIT
 * @version       1.0.0
 * @description   Generate beautiful inline SVG sparklines for dashboards,
 *                reports, and data visualisation.  No dependencies; works
 *                in the browser and in Node.js (returns SVG strings).
 *
 * Chart types
 *   line        Smooth / straight line sparkline with optional dots
 *   area        Filled area under the line
 *   bar         Vertical bar sparkline
 *   tristate    Bars coloured by sign (positive / negative / zero)
 *   pie         Compact pie / donut chart
 *   bullet      Performance bar with target marker
 *   multi       Multiple overlaid line series
 *
 * Quick start
 *   const svg = Sparkline.line([1, 5, 2, 8, 3, 7, 4]);
 *   document.body.innerHTML = svg;
 *
 *   Sparkline.renderTo(document.getElementById("chart"), [3, 6, 2, 9, 5], "bar");
 *
 *   const areaSvg = Sparkline.area([1, 3, 2, 5, 4, 8, 6], {
 *     color: "#3b82f6",
 *     fillOpacity: 0.2
 *   });
 */

(function (global) {
  "use strict";

  /* ============================================================
     1. Default options
     ============================================================ */
  var DEFAULTS = {
    width: 220,
    height: 60,
    color: "#ef4444",
    fillColor: null, // used for area charts; defaults to series color
    fillOpacity: 0.15,
    strokeWidth: 3,
    padding: 5,
    smooth: true, // bezier smoothing for line / area charts
    showDots: false, // draw a dot for every data point
    showMinMax: true, // highlight min & max with coloured dots
    dotRadius: 3,
    dotColor: null, // defaults to series color
    minMaxColor: null, // defaults to series color
    normalRange: null, // [low, high] shaded band overlay
    normalRangeColor: "#e5e7eb",
    normalRangeOpacity: 0.5,
    zeroLine: false, // draw a dashed zero / midline
    zeroLineColor: "#d1d5db",
    tooltip: false, // attach native <title> tooltips
    donut: false, // for pie charts
    negColor: "#ef4444", // for tristate charts
    zeroColor: "#9ca3af", // for tristate charts
    colors: null, // palette array for pie / multi / bar / line / area charts
  };

  var PALETTE = [
    "#ef4444",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#f97316",
  ];

  /* ============================================================
     2. Utility helpers
     ============================================================ */

  /** Merge user options on top of defaults (shallow). */
  function mergeOptions(options) {
    var merged = {};
    var key;
    for (key in DEFAULTS) {
      if (DEFAULTS.hasOwnProperty(key)) merged[key] = DEFAULTS[key];
    }
    if (options) {
      for (key in options) {
        if (options.hasOwnProperty(key)) merged[key] = options[key];
      }
    }
    return merged;
  }

  /** Escape XML special characters. */
  function escapeXml(str) {
    if (typeof str !== "string") str = String(str);
    var amp = String.fromCharCode(38);
    var replacements = {};
    replacements[amp] = amp + "amp;";
    replacements[String.fromCharCode(60)] = amp + "lt;";
    replacements[String.fromCharCode(62)] = amp + "gt;";
    replacements[String.fromCharCode(34)] = amp + "quot;";
    replacements[String.fromCharCode(39)] = amp + "apos;";
    return str.replace(
      new RegExp(
        amp + "|<|>|" + String.fromCharCode(34) + "|" + String.fromCharCode(39),
        "g",
      ),
      function (ch) {
        return replacements[ch];
      },
    );
  }

  /** Return { min, max } for an array of numbers. */
  function extent(data) {
    var min = Infinity;
    var max = -Infinity;
    for (var i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    return { min: min, max: max };
  }

  /** Round to 2 decimal places (keeps SVG concise). */
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /** Convert an array of numbers into SVG coordinate points. */
  function buildPoints(data, width, height, padding) {
    var ext = extent(data);
    var range = ext.max - ext.min || 1;
    var step = (width - padding * 2) / (data.length - 1);

    return data.map(function (value, index) {
      var x = padding + index * step;
      var y =
        height - padding - ((value - ext.min) / range) * (height - padding * 2);
      return { x: round2(x), y: round2(y), value: value };
    });
  }

  /** Wrap inner SVG markup in a complete <svg> document. */
  function svgWrap(width, height, inner) {
    return (
      '<svg width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 ' +
      width +
      " " +
      height +
      '" xmlns="http://www.w3.org/2000/svg">' +
      inner +
      "</svg>"
    );
  }

  /** Build a <circle> element string. */
  function dotEl(cx, cy, r, fill, title) {
    var t = title ? "<title>" + escapeXml(title) + "</title>" : "";
    return (
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="' +
      r +
      '" fill="' +
      fill +
      '">' +
      t +
      "</circle>"
    );
  }

  /* ============================================================
     3. Smoothing — Catmull-Rom → cubic-Bezier control points
     ============================================================ */

  function controlPoint(current, previous, next, reverse) {
    var p = previous || current;
    var n = next || current;
    var smoothing = 0.2;

    var o = {
      length: Math.hypot(n.x - p.x, n.y - p.y),
      angle: Math.atan2(n.y - p.y, n.x - p.x),
    };

    var angle = reverse ? o.angle + Math.PI : o.angle;
    var length = o.length * smoothing;

    return {
      x: round2(current.x + Math.cos(angle) * length),
      y: round2(current.y + Math.sin(angle) * length),
    };
  }

  /** Build a smooth bezier path string. */
  function smoothPath(points) {
    if (points.length < 2) return "";
    var d = "M " + points[0].x + " " + points[0].y;

    for (var i = 1; i < points.length; i++) {
      var cps = controlPoint(points[i - 1], points[i - 2], points[i]);
      var cpe = controlPoint(points[i], points[i - 1], points[i + 1], true);
      d +=
        " C " +
        cps.x +
        " " +
        cps.y +
        ", " +
        cpe.x +
        " " +
        cpe.y +
        ", " +
        points[i].x +
        " " +
        points[i].y;
    }
    return d;
  }

  /** Build a straight polyline path string. */
  function straightPath(points) {
    if (points.length < 2) return "";
    var d = "M " + points[0].x + " " + points[0].y;
    for (var i = 1; i < points.length; i++) {
      d += " L " + points[i].x + " " + points[i].y;
    }
    return d;
  }

  /* ============================================================
     4. Chart types
     ============================================================ */

  var _gradientId = 0; // unique counter for SVG gradient element IDs

  /* ---------- LINE ---------- */

  /**
   * Line sparkline — smooth or straight bezier path.
   *
   * @param {number[]} data
   * @param {object}   options
   * @returns {string} SVG string
   */
  function line(data, options) {
    var opts = mergeOptions(options);
    if (!data || data.length < 2) return "";

    var width = opts.width;
    var height = opts.height;
    var color = opts.color;
    var strokeWidth = opts.strokeWidth;
    var padding = opts.padding;

    var points = buildPoints(data, width, height, padding);
    var d = opts.smooth ? smoothPath(points) : straightPath(points);
    var inner = "";

    // Normal range shaded band
    if (opts.normalRange) {
      var ext = extent(data);
      var totalMin = Math.min(ext.min, opts.normalRange[0]);
      var totalMax = Math.max(ext.max, opts.normalRange[1]);
      var rng = totalMax - totalMin || 1;
      var bandTop =
        height -
        padding -
        ((opts.normalRange[1] - totalMin) / rng) * (height - padding * 2);
      var bandBottom =
        height -
        padding -
        ((opts.normalRange[0] - totalMin) / rng) * (height - padding * 2);
      inner +=
        '<rect x="' +
        padding +
        '" y="' +
        round2(bandTop) +
        '" width="' +
        (width - padding * 2) +
        '" height="' +
        round2(bandBottom - bandTop) +
        '" fill="' +
        opts.normalRangeColor +
        '" fill-opacity="' +
        opts.normalRangeOpacity +
        '"/>';
    }

    // Zero / midline
    if (opts.zeroLine) {
      var zeroY = height / 2;
      inner +=
        '<line x1="' +
        padding +
        '" y1="' +
        zeroY +
        '" x2="' +
        (width - padding) +
        '" y2="' +
        zeroY +
        '" stroke="' +
        opts.zeroLineColor +
        '" stroke-width="1" stroke-dasharray="2,2"/>';
    }

    // Main path
    var tooltipTag = opts.tooltip
      ? "<title>" + escapeXml(data.join(", ")) + "</title>"
      : "";

    if (opts.colors && opts.colors.length > 0) {
      // Multi-color line: render per-segment straight lines, each with its own colour
      for (var si = 0; si < points.length - 1; si++) {
        var segColor = opts.colors[si % opts.colors.length];
        var segTooltip = opts.tooltip
          ? "<title>" + escapeXml("Value: " + points[si + 1].value) + "</title>"
          : "";
        inner +=
          '<line x1="' +
          points[si].x +
          '" y1="' +
          points[si].y +
          '" x2="' +
          points[si + 1].x +
          '" y2="' +
          points[si + 1].y +
          '" stroke="' +
          segColor +
          '" stroke-width="' +
          strokeWidth +
          '" stroke-linecap="round" stroke-linejoin="round">' +
          segTooltip +
          "</line>";
      }
    } else {
      inner +=
        '<path d="' +
        d +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="' +
        strokeWidth +
        '" stroke-linecap="round" stroke-linejoin="round">' +
        tooltipTag +
        "</path>";
    }

    // Min / max dots
    if (opts.showMinMax) {
      var ext2 = extent(data);
      var minIdx = data.indexOf(ext2.min);
      var maxIdx = data.indexOf(ext2.max);
      var mmColor = opts.minMaxColor || color;
      inner += dotEl(
        points[minIdx].x,
        points[minIdx].y,
        opts.dotRadius,
        mmColor,
        "Min: " + ext2.min,
      );
      inner += dotEl(
        points[maxIdx].x,
        points[maxIdx].y,
        opts.dotRadius,
        mmColor,
        "Max: " + ext2.max,
      );
    }

    // All dots
    if (opts.showDots) {
      var dotColor = opts.dotColor || color;
      var ext3 = extent(data);
      for (var i = 0; i < points.length; i++) {
        if (
          opts.showMinMax &&
          (i === data.indexOf(ext3.min) || i === data.indexOf(ext3.max))
        )
          continue;
        inner += dotEl(
          points[i].x,
          points[i].y,
          opts.dotRadius,
          dotColor,
          "Value: " + points[i].value,
        );
      }
    }

    // Last point emphasis dot
    var last = points[points.length - 1];
    inner += dotEl(
      last.x,
      last.y,
      opts.dotRadius + 1,
      color,
      "Last: " + last.value,
    );

    return svgWrap(width, height, inner);
  }

  /* ---------- AREA ---------- */

  /**
   * Area sparkline — line chart with the area below filled.
   *
   * @param {number[]} data
   * @param {object}   options
   * @returns {string} SVG string
   */
  function area(data, options) {
    var opts = mergeOptions(options);
    if (!data || data.length < 2) return "";

    var width = opts.width;
    var height = opts.height;
    var color = opts.color;
    var padding = opts.padding;
    var fillColor = opts.fillColor || color;

    var points = buildPoints(data, width, height, padding);
    var d = opts.smooth ? smoothPath(points) : straightPath(points);

    // Close path for fill
    var areaD =
      d +
      " L " +
      points[points.length - 1].x +
      " " +
      (height - padding) +
      " L " +
      points[0].x +
      " " +
      (height - padding) +
      " Z";

    var inner = "";

    if (opts.colors && opts.colors.length > 0) {
      // Multi-color area: gradient fill + per-segment stroke
      var gradId = "spark-grad-" + ++_gradientId;
      var stops = "";
      var nColors = opts.colors.length;
      for (var ci = 0; ci < nColors; ci++) {
        var offset = nColors === 1 ? 0 : (ci / (nColors - 1)) * 100;
        stops +=
          '<stop offset="' +
          round2(offset) +
          '%" stop-color="' +
          opts.colors[ci] +
          '"/>';
      }
      inner +=
        '<defs><linearGradient id="' +
        gradId +
        '" x1="0%" y1="0%" x2="100%" y2="0%">' +
        stops +
        "</linearGradient></defs>";

      // Filled area with gradient
      inner +=
        '<path d="' +
        areaD +
        '" fill="url(#' +
        gradId +
        ')" fill-opacity="' +
        opts.fillOpacity +
        '"/>';

      // Per-segment stroke on top
      for (var ai = 0; ai < points.length - 1; ai++) {
        inner +=
          '<line x1="' +
          points[ai].x +
          '" y1="' +
          points[ai].y +
          '" x2="' +
          points[ai + 1].x +
          '" y2="' +
          points[ai + 1].y +
          '" stroke="' +
          opts.colors[ai % nColors] +
          '" stroke-width="' +
          opts.strokeWidth +
          '" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    } else {
      // Filled area
      inner +=
        '<path d="' +
        areaD +
        '" fill="' +
        fillColor +
        '" fill-opacity="' +
        opts.fillOpacity +
        '"/>';

      // Line stroke on top
      inner +=
        '<path d="' +
        d +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="' +
        opts.strokeWidth +
        '" stroke-linecap="round" stroke-linejoin="round"/>';
    }

    // Min / max dots
    if (opts.showMinMax) {
      var ext = extent(data);
      var minIdx = data.indexOf(ext.min);
      var maxIdx = data.indexOf(ext.max);
      var mmColor = opts.minMaxColor || color;
      inner += dotEl(
        points[minIdx].x,
        points[minIdx].y,
        opts.dotRadius,
        mmColor,
        "Min: " + ext.min,
      );
      inner += dotEl(
        points[maxIdx].x,
        points[maxIdx].y,
        opts.dotRadius,
        mmColor,
        "Max: " + ext.max,
      );
    }

    // Last point emphasis dot
    var last = points[points.length - 1];
    inner += dotEl(
      last.x,
      last.y,
      opts.dotRadius + 1,
      color,
      "Last: " + last.value,
    );

    return svgWrap(width, height, inner);
  }

  /* ---------- BAR ---------- */

  /**
   * Bar sparkline — vertical bars.
   *
   * @param {number[]} data
   * @param {object}   options
   * @returns {string} SVG string
   */
  function bar(data, options) {
    var opts = mergeOptions(options);
    if (!data || data.length === 0) return "";

    var width = opts.width;
    var height = opts.height;
    var color = opts.color;
    var padding = opts.padding;

    var ext = extent(data);
    var range = ext.max - ext.min || 1;
    var slot = (width - padding * 2) / data.length;
    var barWidth = Math.max(1, slot * 0.7);
    var baseline = height - padding;
    var inner = "";

    // Zero line for negative data
    if (ext.min < 0 || opts.zeroLine) {
      var zeroY = baseline - ((0 - ext.min) / range) * (height - padding * 2);
      inner +=
        '<line x1="' +
        padding +
        '" y1="' +
        round2(zeroY) +
        '" x2="' +
        (width - padding) +
        '" y2="' +
        round2(zeroY) +
        '" stroke="' +
        opts.zeroLineColor +
        '" stroke-width="1"/>';
    }

    for (var i = 0; i < data.length; i++) {
      var barH = ((data[i] - ext.min) / range) * (height - padding * 2);
      var x = padding + i * slot + (slot - barWidth) / 2;
      var y = baseline - barH;
      var barColor =
        (opts.colors && opts.colors[i % opts.colors.length]) || color;
      var titleTag = opts.tooltip
        ? "<title>" + escapeXml(String(data[i])) + "</title>"
        : "";
      inner +=
        '<rect x="' +
        round2(x) +
        '" y="' +
        round2(y) +
        '" width="' +
        round2(barWidth) +
        '" height="' +
        round2(barH) +
        '" fill="' +
        barColor +
        '" rx="1">' +
        titleTag +
        "</rect>";
    }

    return svgWrap(width, height, inner);
  }

  /* ---------- TRISTATE ---------- */

  /**
   * Tristate sparkline — bars coloured by sign (positive / negative / zero).
   *
   * @param {number[]} data
   * @param {object}   options
   * @returns {string} SVG string
   */
  function tristate(data, options) {
    var opts = mergeOptions(options);
    if (!data || data.length === 0) return "";

    var width = opts.width;
    var height = opts.height;
    var padding = opts.padding;
    var posColor = opts.color || "#10b981";
    var negColor = opts.negColor || "#ef4444";
    var zeroColor = opts.zeroColor || "#9ca3af";

    var slot = (width - padding * 2) / data.length;
    var barWidth = Math.max(1, slot * 0.7);
    var baseline = height / 2;

    var maxAbs = 0;
    for (var i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > maxAbs) maxAbs = Math.abs(data[i]);
    }
    maxAbs = maxAbs || 1;

    var inner = "";
    for (var j = 0; j < data.length; j++) {
      var val = data[j];
      var barH = (Math.abs(val) / maxAbs) * (height / 2 - padding);
      var x = padding + j * slot + (slot - barWidth) / 2;
      var y = val >= 0 ? baseline - barH : baseline;
      var fill = val > 0 ? posColor : val < 0 ? negColor : zeroColor;
      var titleTag = opts.tooltip
        ? "<title>" + escapeXml(String(val)) + "</title>"
        : "";
      inner +=
        '<rect x="' +
        round2(x) +
        '" y="' +
        round2(y) +
        '" width="' +
        round2(barWidth) +
        '" height="' +
        round2(barH) +
        '" fill="' +
        fill +
        '" rx="1">' +
        titleTag +
        "</rect>";
    }

    // Midline
    inner +=
      '<line x1="' +
      padding +
      '" y1="' +
      baseline +
      '" x2="' +
      (width - padding) +
      '" y2="' +
      baseline +
      '" stroke="' +
      opts.zeroLineColor +
      '" stroke-width="1"/>';

    return svgWrap(width, height, inner);
  }

  /* ---------- PIE / DONUT ---------- */

  /**
   * Pie / donut micro-chart.
   *
   * @param {number[]} data
   * @param {object}   options
   * @returns {string} SVG string
   */
  function pie(data, options) {
    var opts = mergeOptions(options);
    if (!data || data.length === 0) return "";

    var width = opts.width;
    var height = opts.height;
    var padding = opts.padding;
    var radius = Math.min(width, height) / 2 - padding;
    var cx = width / 2;
    var cy = height / 2;
    var total = 0;
    for (var t = 0; t < data.length; t++) total += data[t];
    total = total || 1;

    var donut = opts.donut;
    var innerR = donut ? radius * 0.55 : 0;
    var inner = "";
    var startAngle = -Math.PI / 2; // start at 12 o'clock

    for (var i = 0; i < data.length; i++) {
      var angle = (data[i] / total) * Math.PI * 2;
      var endAngle = startAngle + angle;

      var x1 = cx + radius * Math.cos(startAngle);
      var y1 = cy + radius * Math.sin(startAngle);
      var x2 = cx + radius * Math.cos(endAngle);
      var y2 = cy + radius * Math.sin(endAngle);
      var largeArc = angle > Math.PI ? 1 : 0;
      var fill = (opts.colors && opts.colors[i]) || PALETTE[i % PALETTE.length];

      var path;
      if (donut) {
        var ix1 = cx + innerR * Math.cos(endAngle);
        var iy1 = cy + innerR * Math.sin(endAngle);
        var ix2 = cx + innerR * Math.cos(startAngle);
        var iy2 = cy + innerR * Math.sin(startAngle);
        path =
          "M " +
          round2(x1) +
          " " +
          round2(y1) +
          " A " +
          radius +
          " " +
          radius +
          " 0 " +
          largeArc +
          " 1 " +
          round2(x2) +
          " " +
          round2(y2) +
          " L " +
          round2(ix1) +
          " " +
          round2(iy1) +
          " A " +
          innerR +
          " " +
          innerR +
          " 0 " +
          largeArc +
          " 0 " +
          round2(ix2) +
          " " +
          round2(iy2) +
          " Z";
      } else {
        path =
          "M " +
          cx +
          " " +
          cy +
          " L " +
          round2(x1) +
          " " +
          round2(y1) +
          " A " +
          radius +
          " " +
          radius +
          " 0 " +
          largeArc +
          " 1 " +
          round2(x2) +
          " " +
          round2(y2) +
          " Z";
      }

      var titleTag = opts.tooltip
        ? "<title>" +
          escapeXml(
            data[i] + " (" + ((data[i] / total) * 100).toFixed(1) + "%)",
          ) +
          "</title>"
        : "";
      inner +=
        '<path d="' +
        path +
        '" fill="' +
        fill +
        '" stroke="#fff" stroke-width="1">' +
        titleTag +
        "</path>";

      startAngle = endAngle;
    }

    return svgWrap(width, height, inner);
  }

  /* ---------- BULLET ---------- */

  /**
   * Bullet sparkline — a performance bar with target marker.
   *
   * @param {number} value   current value
   * @param {number} target  target marker position
   * @param {number} max     maximum scale
   * @param {object} options
   * @returns {string} SVG string
   */
  function bullet(value, target, max, options) {
    var opts = mergeOptions(options);
    var width = opts.width;
    var height = opts.height;
    var color = opts.color;
    var padding = opts.padding;

    var barHeight = (height - padding * 2) * 0.4;
    var barY = (height - barHeight) / 2;
    var barWidth = (value / (max || 1)) * (width - padding * 2);

    var inner = "";

    // Track
    inner +=
      '<rect x="' +
      padding +
      '" y="' +
      round2(barY) +
      '" width="' +
      (width - padding * 2) +
      '" height="' +
      round2(barHeight) +
      '" fill="#e5e7eb" rx="2"/>';

    // Value bar
    inner +=
      '<rect x="' +
      padding +
      '" y="' +
      round2(barY) +
      '" width="' +
      round2(barWidth) +
      '" height="' +
      round2(barHeight) +
      '" fill="' +
      color +
      '" rx="2"/>';

    // Target marker
    var targetX = padding + (target / (max || 1)) * (width - padding * 2);
    inner +=
      '<line x1="' +
      round2(targetX) +
      '" y1="' +
      padding +
      '" x2="' +
      round2(targetX) +
      '" y2="' +
      (height - padding) +
      '" stroke="#1f2937" stroke-width="2"/>';

    return svgWrap(width, height, inner);
  }

  /* ---------- MULTI-LINE ---------- */

  /**
   * Multi-series line sparkline — draw several overlaid lines.
   *
   * @param {number[][]} seriesData
   * @param {object[]}   seriesOptions  per-series overrides (optional)
   * @param {object}     globalOptions  shared options like width / height
   * @returns {string} SVG string
   */
  function multiLine(seriesData, seriesOptions, globalOptions) {
    var opts = mergeOptions(globalOptions);
    if (!seriesData || seriesData.length === 0) return "";

    var width = opts.width;
    var height = opts.height;
    var padding = opts.padding;

    // Compute global extent across all series
    var allValues = [];
    for (var a = 0; a < seriesData.length; a++) {
      for (var b = 0; b < seriesData[a].length; b++) {
        allValues.push(seriesData[a][b]);
      }
    }
    var ext = extent(allValues);
    var range = ext.max - ext.min || 1;

    var inner = "";

    for (var idx = 0; idx < seriesData.length; idx++) {
      var data = seriesData[idx];
      if (!data || data.length < 2) continue;

      var sOpts = mergeOptions(opts);
      if (seriesOptions && seriesOptions[idx]) {
        for (var k in seriesOptions[idx]) {
          if (seriesOptions[idx].hasOwnProperty(k))
            sOpts[k] = seriesOptions[idx][k];
        }
      }
      sOpts.color = sOpts.color || PALETTE[idx % PALETTE.length];

      var step = (width - padding * 2) / (data.length - 1);
      var points = data.map(function (value, index) {
        var x = padding + index * step;
        var y =
          height -
          padding -
          ((value - ext.min) / range) * (height - padding * 2);
        return { x: round2(x), y: round2(y), value: value };
      });

      var d =
        sOpts.smooth !== false ? smoothPath(points) : straightPath(points);
      inner +=
        '<path d="' +
        d +
        '" fill="none" stroke="' +
        sOpts.color +
        '" stroke-width="' +
        sOpts.strokeWidth +
        '" stroke-linecap="round" stroke-linejoin="round"/>';

      // Last point dot
      var last = points[points.length - 1];
      inner += dotEl(
        last.x,
        last.y,
        sOpts.dotRadius || 2,
        sOpts.color,
        "Series " + (idx + 1) + ": " + last.value,
      );
    }

    return svgWrap(width, height, inner);
  }

  /* ============================================================
     5. DOM helper
     ============================================================ */

  /**
   * Render a sparkline directly into a DOM element.
   *
   * @param {HTMLElement} el
   * @param {number[]}    data
   * @param {string}      type  "line" | "area" | "bar" | "tristate" | "pie" | "bullet" | "multi"
   * @param {object}     options
   * @returns {HTMLElement} the element (for chaining)
   */
  function renderTo(el, data, type, options) {
    if (!el) return null;
    var svg = create(data, type, options);
    el.innerHTML = svg;
    return el;
  }

  /* ============================================================
     6. Factory / dispatcher
     ============================================================ */

  /**
   * Factory that dispatches to the correct chart function.
   *
   * @param {number[]|object} data
   * @param {string}          type
   * @param {object}          options
   * @returns {string} SVG string
   */
  function create(data, type, options) {
    type = type || "line";
    switch (type) {
      case "line":
        return line(data, options);
      case "area":
        return area(data, options);
      case "bar":
        return bar(data, options);
      case "tristate":
        return tristate(data, options);
      case "pie":
        return pie(data, options);
      case "bullet":
        return bullet(
          data && data.value !== undefined ? data.value : data,
          data && data.target !== undefined ? data.target : 0,
          data && data.max !== undefined ? data.max : 100,
          options,
        );
      case "multi":
        return multiLine(data, options && options.series, options);
      default:
        return line(data, options);
    }
  }

  /* ============================================================
     7. Public API
     ============================================================ */

  var Sparkline = {
    version: "1.0.0",
    DEFAULTS: DEFAULTS,
    PALETTE: PALETTE,

    // chart types
    create: create,
    line: line,
    area: area,
    bar: bar,
    tristate: tristate,
    pie: pie,
    bullet: bullet,
    multiLine: multiLine,

    // DOM helper
    renderTo: renderTo,

    // utilities exposed for advanced use
    util: {
      mergeOptions: mergeOptions,
      extent: extent,
      escapeXml: escapeXml,
      buildPoints: buildPoints,
      smoothPath: smoothPath,
      straightPath: straightPath,
      controlPoint: controlPoint,
    },
  };

  // Export for CommonJS, AMD, and browser global
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Sparkline;
  }
  if (typeof define === "function" && define.amd) {
    define(function () {
      return Sparkline;
    });
  }
  global.Sparkline = Sparkline;
})(typeof window !== "undefined" ? window : this);
