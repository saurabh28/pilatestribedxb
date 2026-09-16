/* Reusable UI primitives. Plain React.createElement (h) calls, no JSX/build step. */

var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useMemo = React.useMemo;
var useId = React.useId || function () { var ref = useRef(null); if (!ref.current) ref.current = "id-" + Math.random().toString(36).slice(2); return ref.current; };

function Card(props) {
  return h("div", { className: classNames("card", props.className) }, props.children);
}
function SectionLabel(props) {
  return h("div", { className: "section-label" }, props.children);
}
function EmptyState(props) {
  return h("div", { className: "empty-state" },
    props.icon && h("div", { className: "empty-state-icon" }, props.icon),
    h("div", { className: "empty-state-title" }, props.title),
    props.message && h("p", null, props.message),
    props.action || null
  );
}
function Button(props) {
  var variant = props.variant || "primary";
  var rest = Object.assign({}, props);
  delete rest.variant; delete rest.size; delete rest.className; delete rest.children;
  return h("button", Object.assign({
    className: classNames("btn",
      variant === "primary" && "btn-primary",
      variant === "secondary" && "btn-secondary",
      variant === "danger" && "btn-danger",
      variant === "text" && "btn-text",
      props.size === "sm" && "btn-sm",
      props.className)
  }, rest), props.children);
}
function Badge(props) {
  return h("span", { className: classNames("badge", "badge-" + (props.tone || "neutral")) }, props.children);
}
var TONE_VAR = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)", info: "var(--info)" };
function StatCard(props) {
  return h("div", { className: "stat-card" },
    h("div", { className: "stat-card-value", style: props.tone ? { color: TONE_VAR[props.tone] } : undefined }, props.value),
    h("div", { className: "stat-card-label" }, props.label)
  );
}

function FieldWrapper(props) {
  return h("div", { className: "form-field" },
    h("label", { className: "form-label", htmlFor: props.htmlFor }, props.label, props.optional && h("span", { className: "optional" }, " (optional)")),
    props.children,
    props.hint && !props.error && h("span", { className: "form-hint" }, props.hint),
    props.error && h("span", { className: "form-error", role: "alert" }, props.error)
  );
}
function TextField(props) {
  var id = props.id || useId();
  var rest = Object.assign({}, props);
  ["label", "id", "optional", "hint", "error", "className"].forEach(function (k) { delete rest[k]; });
  return h(FieldWrapper, { label: props.label, htmlFor: id, optional: props.optional, hint: props.hint, error: props.error },
    h("input", Object.assign({ id: id, className: classNames("input", props.error && "has-error", props.className) }, rest))
  );
}
function TextAreaField(props) {
  var id = props.id || useId();
  var rest = Object.assign({}, props);
  ["label", "id", "optional", "hint", "error", "className"].forEach(function (k) { delete rest[k]; });
  return h(FieldWrapper, { label: props.label, htmlFor: id, optional: props.optional, hint: props.hint, error: props.error },
    h("textarea", Object.assign({ id: id, className: classNames("textarea", props.error && "has-error", props.className) }, rest))
  );
}
function SelectField(props) {
  var id = props.id || useId();
  var rest = Object.assign({}, props);
  ["label", "id", "optional", "hint", "error", "className", "children"].forEach(function (k) { delete rest[k]; });
  return h(FieldWrapper, { label: props.label, htmlFor: id, optional: props.optional, hint: props.hint, error: props.error },
    h("select", Object.assign({ id: id, className: classNames("select", props.className) }, rest), props.children)
  );
}
function RadioGroupField(props) {
  var groupId = useId();
  return h("fieldset", { className: "form-group", "aria-labelledby": groupId },
    h("legend", { id: groupId }, props.label),
    props.options.map(function (opt) {
      return h("label", { className: "radio-row", key: opt },
        h("input", {
          type: "radio", name: props.name, value: opt, checked: props.value === opt,
          onChange: function () { props.onChange(opt); },
        }),
        opt
      );
    })
  );
}
function MultiSelectChips(props) {
  var groupId = useId();
  function toggle(opt) {
    if (props.value.indexOf(opt) !== -1) props.onChange(props.value.filter(function (v) { return v !== opt; }));
    else props.onChange(props.value.concat([opt]));
  }
  return h("div", { className: "form-field", role: "group", "aria-labelledby": groupId },
    h("span", { className: "form-label", id: groupId }, props.label),
    h("div", { className: "chip-group" },
      props.options.map(function (opt) {
        var selected = props.value.indexOf(opt) !== -1;
        return h("button", {
          type: "button", key: opt, className: classNames("chip", selected && "selected"),
          "aria-pressed": selected, onClick: function () { toggle(opt); },
        }, opt);
      })
    )
  );
}
function SegmentedControl(props) {
  return h("div", { className: "segmented", role: "radiogroup", "aria-label": props.ariaLabel },
    props.options.map(function (opt) {
      return h("button", {
        key: opt.value, type: "button", role: "radio", "aria-checked": props.value === opt.value,
        className: props.value === opt.value ? "active" : "", onClick: function () { props.onChange(opt.value); },
      }, opt.label);
    })
  );
}
function TabBar(props) {
  return h("div", { className: "tabbar", role: "tablist" },
    props.tabs.map(function (tab) {
      return h("button", {
        key: tab.value, role: "tab", type: "button", "aria-selected": props.value === tab.value,
        className: classNames("tabbar-item", props.value === tab.value && "active"),
        onClick: function () { props.onChange(tab.value); },
      }, tab.label);
    })
  );
}
function SearchBar(props) {
  var id = useId();
  return h("div", { className: "search-bar" },
    h(SearchIconGlyph, { width: 18, height: 18, "aria-hidden": true }),
    h("label", { htmlFor: id, className: "sr-only" }, props.placeholder || "Search"),
    h("input", {
      id: id, type: "search", placeholder: props.placeholder || "Search", value: props.value,
      onChange: function (e) { props.onChange(e.target.value); },
    }),
    props.value && h("button", {
      type: "button", className: "icon-btn", "aria-label": "Clear search",
      onClick: function () { props.onChange(""); },
    }, h(XIcon, { width: 16, height: 16 }))
  );
}
function ConfirmDialog(props) {
  var ref = useRef(null);
  useEffect(function () {
    if (!props.open) return;
    if (ref.current) ref.current.focus();
    function onKey(e) { if (e.key === "Escape") props.onCancel(); }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [props.open]);
  if (!props.open) return null;
  return h("div", { className: "modal-overlay", onClick: props.onCancel },
    h("div", {
      className: "modal-sheet", role: "alertdialog", "aria-modal": "true", tabIndex: -1, ref: ref,
      onClick: function (e) { e.stopPropagation(); },
    },
      h("div", { className: "modal-title" }, props.title),
      h("p", { className: "modal-message" }, props.message),
      h("div", { className: "modal-actions" },
        h(Button, { variant: "secondary", className: "btn-block", onClick: props.onCancel }, "Cancel"),
        h(Button, { variant: props.danger === false ? "primary" : "danger", className: "btn-block", onClick: props.onConfirm }, props.confirmLabel || "Delete")
      )
    )
  );
}
