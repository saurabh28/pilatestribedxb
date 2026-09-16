/* Icon set - small stroke-based SVGs, no icon library, no build step: plain
   React.createElement calls (shorthand "h") instead of JSX. */
var h = React.createElement;

function Icon(props) {
  var children = props.children;
  var rest = Object.assign({}, props);
  delete rest.children;
  var defaults = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round",
  };
  return React.createElement("svg", Object.assign({}, defaults, rest), children);
}

function HomeIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("path", { d: "M3 11.5 12 4l9 7.5" }),
    React.createElement("path", { d: "M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" })
  );
}
function UsersIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("circle", { cx: 9, cy: 8, r: 3.2 }),
    React.createElement("path", { d: "M3.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" }),
    React.createElement("circle", { cx: 17, cy: 9, r: 2.6 }),
    React.createElement("path", { d: "M15.8 14.2c2.4.3 4.2 2.5 4.2 5.3" })
  );
}
function PlusCircleIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("circle", { cx: 12, cy: 12, r: 9 }),
    React.createElement("path", { d: "M12 8v8M8 12h8" })
  );
}
function MoreIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("circle", { cx: 5, cy: 12, r: 1.6, fill: "currentColor", stroke: "none" }),
    React.createElement("circle", { cx: 12, cy: 12, r: 1.6, fill: "currentColor", stroke: "none" }),
    React.createElement("circle", { cx: 19, cy: 12, r: 1.6, fill: "currentColor", stroke: "none" })
  );
}
function CalendarIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("rect", { x: 3.5, y: 5, width: 17, height: 16, rx: 2.5 }),
    React.createElement("path", { d: "M3.5 9.5h17M8 3v4M16 3v4" })
  );
}
function TargetIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("circle", { cx: 12, cy: 12, r: 8.5 }),
    React.createElement("circle", { cx: 12, cy: 12, r: 4.5 }),
    React.createElement("circle", { cx: 12, cy: 12, r: 0.8, fill: "currentColor", stroke: "none" })
  );
}
function GearIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("circle", { cx: 12, cy: 12, r: 3 }),
    React.createElement("path", { d: "M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.6A1.7 1.7 0 0 0 11.6 3V2.9a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" })
  );
}
function ChevronRightIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 18, height: 18 }, props),
    React.createElement("path", { d: "m9 6 6 6-6 6" })
  );
}
function ChevronLeftIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 22, height: 22 }, props),
    React.createElement("path", { d: "m15 6-6 6 6 6" })
  );
}
function SearchIconGlyph(props) {
  return React.createElement(Icon, Object.assign({ width: 18, height: 18 }, props),
    React.createElement("circle", { cx: 11, cy: 11, r: 7 }),
    React.createElement("path", { d: "m20 20-3.4-3.4" })
  );
}
function XIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 18, height: 18 }, props),
    React.createElement("path", { d: "M6 6l12 12M18 6 6 18" })
  );
}
function TrashIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 18, height: 18 }, props),
    React.createElement("path", { d: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.3a2 2 0 0 1-2 1.7H8.7a2 2 0 0 1-2-1.7L6 7" })
  );
}
function EditIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 18, height: 18 }, props),
    React.createElement("path", { d: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" }),
    React.createElement("path", { d: "m14 6 3 3" })
  );
}
function DownloadIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 20, height: 20 }, props),
    React.createElement("path", { d: "M12 4v11m0 0-4-4m4 4 4-4" }),
    React.createElement("path", { d: "M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" })
  );
}
function UploadIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 20, height: 20 }, props),
    React.createElement("path", { d: "M12 20V9m0 0 4 4m-4-4-4 4" }),
    React.createElement("path", { d: "M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" })
  );
}
function ClipboardIcon(props) {
  return React.createElement(Icon, props,
    React.createElement("rect", { x: 5, y: 4, width: 14, height: 17, rx: 2 }),
    React.createElement("path", { d: "M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" }),
    React.createElement("path", { d: "M8.5 11h7M8.5 15h5" })
  );
}
function AlertIcon(props) {
  return React.createElement(Icon, Object.assign({ width: 18, height: 18 }, props),
    React.createElement("path", { d: "M12 9v4" }),
    React.createElement("path", { d: "M10.3 3.9 2.6 17.5A1.5 1.5 0 0 0 4 20h16a1.5 1.5 0 0 0 1.3-2.5L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" }),
    React.createElement("circle", { cx: 12, cy: 16.3, r: 0.9, fill: "currentColor", stroke: "none" })
  );
}
