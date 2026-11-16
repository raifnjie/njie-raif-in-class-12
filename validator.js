/* CampusConnect registration validator.
 * Layer 1: HTML constraint attributes (required, pattern, type, minlength, maxlength).
 * Layer 2: this file — friendly messages, rules HTML can't express, timing, and navigation.
 * Nothing is sent or stored; all values (including passwords) live only in the DOM. */

const form = document.querySelector("#regForm");
const sections = Array.from(form.querySelectorAll(".step"));
const fields = Array.from(form.querySelectorAll("input, select, textarea"));
const summary = document.querySelector("#error-summary");
const status = document.querySelector("#projectStatus");
const password = document.querySelector("#password");
const confirmField = document.querySelector("#confirm");
const REVIEW_STEP = sections.length - 1;
let currentStep = 0;

/* ---------- Shared rules (single source of truth) ---------- */

// Password requirements: used by both the validator and the live checklist.
const PASSWORD_RULES = {
  len:    { test: function (v) { return v.length >= 8; },              text: "at least 8 characters" },
  upper:  { test: function (v) { return /[A-Z]/.test(v); },            text: "an uppercase letter" },
  lower:  { test: function (v) { return /[a-z]/.test(v); },            text: "a lowercase letter" },
  digit:  { test: function (v) { return /[0-9]/.test(v); },            text: "a digit" },
  // A symbol is anything that is not a letter, digit, or whitespace.
  symbol: { test: function (v) { return /[^A-Za-z0-9\s]/.test(v); },   text: "a symbol" }
};

// Human-readable names, keyed by field name (radios share one name).
const LABELS = {
  fullname: "Full name",
  campusEmail: "Campus email",
  studentId: "Student ID",
  password: "Password",
  confirm: "Password confirmation",
  tier: "Tier",
  "interests[]": "Interests",
  bio: "Bio",
  terms: "Terms"
};

// Custom rules per field name. Each rule returns true when valid.
// Rules run only when the field has a value; "required" is handled separately.
const RULES = {
  fullname: [
    { test: function (v) { return /[A-Za-z]/.test(v); },
      message: "Full name must contain at least one letter (A–Z)." },
    { test: function (v) { return /^[A-Za-z '\-]+$/.test(v); },
      message: "Full name may only use letters, spaces, hyphens, and apostrophes." }
  ],
  campusEmail: [
    { test: function (v) { return /^[^\s@]+@[^\s@]+$/.test(v); },
      message: "Enter an email address like name@student.gsu.edu." },
    // Exact domain, case-insensitive: "x@STUDENT.GSU.EDU" passes, "x@mail.student.gsu.edu" fails.
    { test: function (v) { return v.split("@")[1].toLowerCase() === "student.gsu.edu"; },
      message: "Campus email must end in @student.gsu.edu." }
  ],
  studentId: [
    { test: function (v) { return /^\d{9}$/.test(v); },
      message: "Student ID must be exactly 9 digits." },
    { test: function (v) { return /^[1-9]/.test(v); },
      message: "Student ID cannot start with 0." }
  ],
  password: [
    { test: function (v) { return missingPasswordRules(v).length === 0; },
      message: function (v) { return "Password needs " + missingPasswordRules(v).join(", ") + "."; } }
  ],
  confirm: [
    // Exact comparison — neither value is trimmed.
    { test: function (v) { return v === password.value; },
      message: "Passwords do not match." }
  ],
  "interests[]": [
    { test: function (v, field) { return field.selectedOptions.length <= 3; },
      message: "Choose no more than 3 interests." }
  ],
  bio: [
    // maxlength does not stop programmatically set values, so check explicitly.
    { test: function (v) { return v.length <= 140; },
      message: function (v) { return "Bio is " + (v.length - 140) + " characters too long (140 max)."; } }
  ]
};

const REQUIRED_MESSAGES = {
  tier: "Choose a membership tier.",
  "interests[]": "Choose at least 1 interest.",
  terms: "You must accept the terms to continue."
};

function missingPasswordRules(value) {
  return Object.keys(PASSWORD_RULES)
    .filter(function (key) { return !PASSWORD_RULES[key].test(value); })
    .map(function (key) { return PASSWORD_RULES[key].text; });
}

/* ---------- Field helpers ---------- */

// Radios in a group share one error element named after the group.
function errorId(field) {
  return (field.type === "radio" ? field.name : field.id) + "_err";
}

function isEmpty(field) {
  if (field.type === "radio") return !form.querySelector('input[name="' + field.name + '"]:checked');
  if (field.type === "checkbox") return !field.checked;
  if (field.tagName === "SELECT") return field.selectedOptions.length === 0;
  return field.value === "";
}

function labelFor(field) {
  return LABELS[field.name] || field.name;
}

// Wire every field to its error element (aria-describedby + polite announcements).
fields.forEach(function (field) {
  if (!field.id) field.id = "field-" + fields.indexOf(field);
  let error = document.getElementById(errorId(field));
  if (!error) {
    error = document.createElement("p");
    error.id = errorId(field);
    error.className = "field-error";
    field.insertAdjacentElement("afterend", error);
  }
  const describedBy = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  describedBy.add(error.id);
  field.setAttribute("aria-describedby", Array.from(describedBy).join(" "));
  error.setAttribute("aria-live", "polite");
});

/* ---------- Validation engine ---------- */

// Returns the first failing message for a field, or "" when valid.
function customMessage(field) {
  if (isEmpty(field)) {
    if (!field.required) return "";
    return REQUIRED_MESSAGES[field.name] || labelFor(field) + " is required.";
  }
  const rules = RULES[field.name] || [];
  const value = field.value;
  for (const rule of rules) {
    if (!rule.test(value, field)) {
      return typeof rule.message === "function" ? rule.message(value) : rule.message;
    }
  }
  return "";
}

function checkField(field) {
  field.setCustomValidity("");
  field.setCustomValidity(customMessage(field));
  const valid = field.checkValidity();
  document.getElementById(errorId(field)).textContent = valid ? "" : field.validationMessage;
  field.setAttribute("aria-invalid", String(!valid));
  return valid;
}

// Validate a list of fields; returns invalid ones, one per radio group.
function invalidFields(list) {
  const seen = new Set();
  return list.filter(function (field) {
    const valid = checkField(field);
    if (valid || seen.has(errorId(field))) return false;
    seen.add(errorId(field));
    return true;
  });
}

/* ---------- Navigation & feedback ---------- */

function showStep(index, keepSummary) {
  currentStep = index;
  if (index === REVIEW_STEP) buildReview(); // always reflect the latest values
  sections.forEach(function (section, i) { section.classList.toggle("active", i === index); });
  document.querySelector("#stepNum").textContent = index + 1;
  if (!keepSummary) summary.hidden = true;
  sections[index].querySelector("h2").focus();
}

function showErrors(invalid) {
  summary.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Please correct " + invalid.length + (invalid.length === 1 ? " field" : " fields");
  const list = document.createElement("ul");
  invalid.forEach(function (field) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#" + field.id;
    link.textContent = labelFor(field) + ": " + field.validationMessage;
    link.addEventListener("click", function (event) {
      event.preventDefault();
      // Reveal the field's section first; a hidden field can't receive focus.
      showStep(sections.indexOf(field.closest(".step")), true);
      field.focus();
    });
    item.appendChild(link);
    list.appendChild(item);
  });
  summary.append(heading, list);
  summary.hidden = false;
  summary.focus();
}

function goNext() {
  const invalid = invalidFields(fields.filter(function (field) {
    return sections[currentStep].contains(field);
  }));
  if (invalid.length) { showErrors(invalid); return; }
  showStep(Math.min(REVIEW_STEP, currentStep + 1));
}

/* ---------- Review summary (non-secret values only) ---------- */

function addRow(list, term, value) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value; // textContent, never innerHTML: user input is not parsed as HTML
  list.append(dt, dd);
}

function buildReview() {
  const review = document.querySelector("#reviewSummary");
  review.replaceChildren();
  const tier = form.querySelector('input[name="tier"]:checked');
  const interests = Array.from(document.querySelector("#interests").selectedOptions)
    .map(function (option) { return option.text; });
  const bio = document.querySelector("#bio").value;

  const groups = [
    { title: "Identity", rows: [
      ["Full name", document.querySelector("#fullname").value],
      ["Campus email", document.querySelector("#campusEmail").value],
      ["Student ID", document.querySelector("#studentId").value]
    ] },
    { title: "Security", rows: [
      // Only an indicator — the password and confirmation are never displayed.
      ["Password", password.value ? "Set (hidden)" : "Not set"]
    ] },
    { title: "Profile", rows: [
      ["Tier", tier ? tier.parentElement.textContent.trim() : "Not chosen"],
      ["Interests", interests.length ? interests.join(", ") : "None chosen"],
      ["Bio", bio || "(none)"],
      ["Terms", document.querySelector("#terms").checked ? "Accepted" : "Not accepted"]
    ] }
  ];

  groups.forEach(function (group, index) {
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const list = document.createElement("dl");
    group.rows.forEach(function (row) { addRow(list, row[0], row[1]); });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit " + group.title;
    edit.addEventListener("click", function () { showStep(index); });
    review.append(heading, list, edit);
  });
}

/* ---------- Live password checklist ---------- */

const ruleItems = Array.from(document.querySelectorAll("#pwRules li"));
ruleItems.forEach(function (item) { item.dataset.label = item.textContent; });

function updatePasswordChecklist() {
  ruleItems.forEach(function (item) {
    const met = PASSWORD_RULES[item.dataset.rule].test(password.value);
    item.classList.toggle("met", met);
    // Text state ("Met"/"Needed") plus an icon, so status never relies on color alone.
    item.textContent = (met ? "✓ Met: " : "✗ Needed: ") + item.dataset.label;
  });
}

/* ---------- Event wiring (Module 6 timing: blur checks, input clears, submit sweeps) ---------- */

form.addEventListener("click", function (event) {
  if (event.target.closest("[data-back]")) showStep(Math.max(0, currentStep - 1)); // never blocks, never clears
  if (event.target.closest("[data-next]")) goNext();
});

fields.forEach(function (field) {
  field.addEventListener("blur", function () { checkField(field); });
  field.addEventListener("input", function () {
    status.textContent = "";
    if (field.getAttribute("aria-invalid") === "true") checkField(field);
    // Changing the password can make an already-entered confirmation stale.
    if (field === password && confirmField.value !== "") checkField(confirmField);
  });
});

password.addEventListener("input", updatePasswordChecklist);

document.querySelector("#bio").addEventListener("input", function (event) {
  document.querySelector("#bioCount").textContent = 140 - event.target.value.length;
});

form.addEventListener("submit", function (event) {
  event.preventDefault(); // no data ever leaves the page
  // Enter on an earlier step acts like Next instead of jumping ahead.
  if (currentStep !== REVIEW_STEP) { goNext(); return; }
  // Final submit: re-run every rule, since earlier steps may have been edited.
  const invalid = invalidFields(fields);
  if (invalid.length) { showErrors(invalid); return; }
  buildReview();
  status.textContent = "All checks passed. Registration complete — nothing was sent or saved.";
});

updatePasswordChecklist();
showStep(0);
