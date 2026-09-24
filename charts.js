/* Small dependency-free SVG charts. Plain React.createElement (h), no JSX. */

var CHART_W = 320, CHART_H = 140, PAD_X = 10, PAD_TOP = 16, PAD_BOTTOM = 24;

/* Pure geometry for an N-axis radar/spider chart. `radius` is the distance
   from center to a value of 1.0 (i.e. value === max). Axis 0 points straight
   up; axes go clockwise. Returns unpadded coordinates (center = radius, radius) —
   RadarChart below adds its own padding for labels. */
function radarChartPoints(data, radius) {
  var n = data.length;
  var center = radius;
  if (n === 0) return { axes: [], center: center };
  var angleStep = (2 * Math.PI) / n;
  var axes = data.map(function (d, i) {
    var angle = -Math.PI / 2 + i * angleStep;
    var max = d.max || 10;
    var ratio = Math.max(0, Math.min(1, d.value / max));
    return {
      label: d.label, value: d.value, angle: angle,
      vx: center + Math.cos(angle) * radius * ratio,
      vy: center + Math.sin(angle) * radius * ratio,
      lx: center + Math.cos(angle) * (radius + 16),
      ly: center + Math.sin(angle) * (radius + 16),
    };
  });
  return { axes: axes, center: center };
}
function ringPolygon(n, radius, center, ratio) {
  var angleStep = (2 * Math.PI) / n;
  var pts = [];
  for (var i = 0; i < n; i++) {
    var angle = -Math.PI / 2 + i * angleStep;
    pts.push((center + Math.cos(angle) * radius * ratio).toFixed(1) + "," + (center + Math.sin(angle) * radius * ratio).toFixed(1));
  }
  return pts.join(" ");
}

function LineChart(props) {
  var data = props.data || [];
  var color = props.color || "var(--accent)";
  var gradientId = "grad-" + Math.random().toString(36).slice(2);

  if (data.length === 0) return h("div", { className: "chart-empty" }, "Not enough data yet.");

  var values = data.map(function (d) { return d.value; });
  var min = props.yMin != null ? props.yMin : Math.min.apply(null, values);
  var max = props.yMax != null ? props.yMax : Math.max.apply(null, values);
  var range = (max - min) || 1;
  var innerW = CHART_W - PAD_X * 2, innerH = CHART_H - PAD_TOP - PAD_BOTTOM;

  var points = data.map(function (d, i) {
    var x = data.length === 1 ? PAD_X + innerW / 2 : PAD_X + (i / (data.length - 1)) * innerW;
    var y = PAD_TOP + innerH - ((d.value - min) / range) * innerH;
    return { x: x, y: y, label: d.label, value: d.value };
  });

  var linePath = points.map(function (p, i) { return (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
  var last = points[points.length - 1];
  var areaPath = linePath + " L" + last.x.toFixed(1) + "," + (PAD_TOP + innerH).toFixed(1) + " L" + points[0].x.toFixed(1) + "," + (PAD_TOP + innerH).toFixed(1) + " Z";
  var fmt = props.formatValue || function (v) { return v + (props.unit || ""); };

  return h("svg", { viewBox: "0 0 " + CHART_W + " " + CHART_H, width: "100%", height: CHART_H, role: "img", "aria-label": "Trend chart" },
    h("defs", null, h("linearGradient", { id: gradientId, x1: 0, y1: 0, x2: 0, y2: 1 },
      h("stop", { offset: "0%", stopColor: color, stopOpacity: 0.25 }),
      h("stop", { offset: "100%", stopColor: color, stopOpacity: 0 })
    )),
    h("path", { d: areaPath, fill: "url(#" + gradientId + ")", stroke: "none" }),
    h("path", { d: linePath, fill: "none", stroke: color, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }),
    points.map(function (p, i) { return h("circle", { key: i, cx: p.x, cy: p.y, r: i === points.length - 1 ? 3.5 : 2.5, fill: color }); }),
    h("text", { x: last.x, y: Math.max(last.y - 10, 10), textAnchor: "end", fontSize: 11, fontWeight: 700, fill: "var(--text)" }, fmt(last.value)),
    h("text", { x: PAD_X, y: CHART_H - 6, fontSize: 10, fill: "var(--text-tertiary)" }, data[0].label),
    h("text", { x: CHART_W - PAD_X, y: CHART_H - 6, textAnchor: "end", fontSize: 10, fill: "var(--text-tertiary)" }, data[data.length - 1].label)
  );
}

function BarChart(props) {
  var data = props.data || [];
  var color = props.color || "var(--accent)";
  if (data.length === 0) return h("div", { className: "chart-empty" }, "Not enough data yet.");
  var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
  var innerW = CHART_W - PAD_X * 2, innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  var barWidth = Math.min(28, (innerW / data.length) * 0.6);
  var gap = innerW / data.length;

  return h("svg", { viewBox: "0 0 " + CHART_W + " " + CHART_H, width: "100%", height: CHART_H, role: "img", "aria-label": "Bar chart" },
    data.map(function (d, i) {
      var bh = (d.value / max) * innerH;
      var cx = PAD_X + gap * i + gap / 2;
      return h("g", { key: i },
        h("rect", { x: cx - barWidth / 2, y: PAD_TOP + innerH - bh, width: barWidth, height: Math.max(bh, 2), rx: 4, fill: color, opacity: 0.85 }),
        h("text", { x: cx, y: CHART_H - 6, textAnchor: "middle", fontSize: 9.5, fill: "var(--text-tertiary)" }, d.label),
        d.value > 0 && h("text", { x: cx, y: PAD_TOP + innerH - bh - 5, textAnchor: "middle", fontSize: 10, fontWeight: 700, fill: "var(--text)" }, d.value)
      );
    })
  );
}

function ProgressRing(props) {
  var size = props.size || 56, stroke = 6;
  var color = props.color || "var(--accent)";
  var r = (size - stroke) / 2, c = 2 * Math.PI * r;
  var clamped = Math.max(0, Math.min(100, props.percent));
  return h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, role: "img", "aria-label": Math.round(clamped) + "% complete" },
    h("circle", { cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: "var(--pill-bg)", strokeWidth: stroke }),
    h("circle", {
      cx: size / 2, cy: size / 2, r: r, fill: "none", stroke: color, strokeWidth: stroke,
      strokeDasharray: c, strokeDashoffset: c - (c * clamped) / 100, strokeLinecap: "round",
      transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")",
      className: "readiness-ring-arc",
    }),
    h("text", { x: "50%", y: "52%", textAnchor: "middle", dominantBaseline: "middle", fontSize: size * 0.24, fontWeight: 700, fill: "var(--text)" }, Math.round(clamped) + "%")
  );
}

function RadarChart(props) {
  var series = props.series;
  if (!series) series = [{ data: props.data || [], color: props.color || "var(--accent)", filled: true }];
  var axisSource = series[0] ? series[0].data : [];
  if (axisSource.length < 3) return h("div", { className: "chart-empty" }, "Add at least 3 tracked areas to see the radar chart.");

  var radius = 90, pad = 40;
  var size = radius * 2 + pad * 2;
  var center = radius + pad;

  var seriesGeo = series.map(function (s) {
    var geo = radarChartPoints(s.data, radius);
    var axes = geo.axes.map(function (a) {
      return Object.assign({}, a, { vx: a.vx + pad, vy: a.vy + pad, lx: a.lx + pad, ly: a.ly + pad });
    });
    var polygon = axes.map(function (a) { return a.vx.toFixed(1) + "," + a.vy.toFixed(1); }).join(" ");
    return { axes: axes, polygon: polygon, color: s.color || "var(--accent)", dashed: !!s.dashed, filled: s.filled !== false };
  });
  var labelAxes = seriesGeo[0].axes;

  return h("svg", { viewBox: "0 0 " + size + " " + size, width: "100%", height: size, role: "img", "aria-label": "Radar chart" },
    [0.5, 1].map(function (ratio, i) {
      return h("polygon", {
        key: "ring-" + i, points: ringPolygon(axisSource.length, radius, center, ratio),
        fill: "none", stroke: "var(--separator)", strokeWidth: 1,
        strokeDasharray: ratio < 1 ? "3,3" : undefined,
      });
    }),
    labelAxes.map(function (a, i) {
      var outerX = center + Math.cos(a.angle) * radius, outerY = center + Math.sin(a.angle) * radius;
      return h("line", { key: "spoke-" + i, x1: center, y1: center, x2: outerX, y2: outerY, stroke: "var(--separator)", strokeWidth: 1 });
    }),
    seriesGeo.map(function (sg, si) {
      return h("polygon", {
        key: "series-" + si, points: sg.polygon,
        fill: sg.filled ? sg.color : "none", fillOpacity: sg.filled ? 0.25 : 0,
        stroke: sg.color, strokeWidth: 2, strokeDasharray: sg.dashed ? "5,4" : undefined,
      });
    }),
    seriesGeo[0].filled && seriesGeo[0].axes.map(function (a, i) { return h("circle", { key: "pt-" + i, cx: a.vx, cy: a.vy, r: 2.5, fill: seriesGeo[0].color }); }),
    labelAxes.map(function (a, i) {
      var anchor = a.lx < center - 4 ? "end" : a.lx > center + 4 ? "start" : "middle";
      return h("text", { key: "label-" + i, x: a.lx, y: a.ly, textAnchor: anchor, dominantBaseline: "middle", fontSize: 10.5, fill: "var(--text-tertiary)" }, a.label);
    })
  );
}
