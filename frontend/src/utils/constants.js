export const COLORS = {
  primary: "#185FA5",
  success: "#3B6D11",
  danger: "#A32D2D",
  warning: "#854F0B",
  neutral: "#5F5E5A",
  border: "#e5e7eb",
  background: "#f8fafc",
  card: "#ffffff",
  muted: "#6b7280",
};

export const CLINICAL_THRESHOLDS = {
  STRONG_DRIVER: 0.65,
  MODERATE_DRIVER: 0.55,
  SUPPRESSOR: 0.35,
  NEUTRAL_DELTA: 0.05,
};

export const APP_PAGES = [
  { key: "dashboard", label: "Dashboard", icon: "DB" },
  { key: "upload", label: "New Analysis", icon: "NA" },
  { key: "history", label: "History", icon: "HS" },
  { key: "glossary", label: "Glossary", icon: "GL" },
];

export const CONCEPT_META = {
  FAA: {
    key: "FAA",
    label: "FAA",
    fullName: "Frontal Alpha Asymmetry",
    description: "Frontal Alpha Asymmetry",
    channels: "F3/F4",
    band: "8-12 Hz",
    clinicalSignificance: "Right hypoactivation pattern",
    reference: "Thibodeau 2006",
  },
  Theta: {
    key: "Theta",
    label: "Theta",
    fullName: "Frontal Theta Power",
    description: "Frontal Theta Power",
    channels: "Fz/F3/F4",
    band: "4-8 Hz",
    clinicalSignificance: "Linked to rumination",
    reference: "Olbrich & Arns 2013",
  },
  Alpha_Power: {
    key: "Alpha_Power",
    label: "Alpha Power",
    fullName: "Parieto-occipital Alpha",
    description: "Parieto-occipital Alpha",
    channels: "P3/P4/O1/O2",
    band: "8-12 Hz",
    clinicalSignificance: "Reduced in hyperarousal",
    reference: "Kaiser 2015",
  },
  Beta_Power: {
    key: "Beta_Power",
    label: "Beta Power",
    fullName: "Frontal-central Beta",
    description: "Frontal-central Beta",
    channels: "F3/F4/C3/C4",
    band: "13-30 Hz",
    clinicalSignificance: "Elevated in anxious rumination",
    reference: "Olbrich 2015",
  },
  TBR: {
    key: "TBR",
    label: "TBR",
    fullName: "Theta/Beta Ratio",
    description: "Theta/Beta Ratio",
    channels: "Fz/F3/F4",
    band: "Ratio metric",
    clinicalSignificance: "Low arousal and inattention",
    reference: "Clarke 2013",
  },
  Coherence: {
    key: "Coherence",
    label: "Coherence",
    fullName: "Interhemispheric Alpha Coherence",
    description: "Interhemispheric Alpha Coherence",
    channels: "F3-F4 / P3-P4 / T3-T4",
    band: "8-12 Hz",
    clinicalSignificance: "Elevated coherence with loss of connectivity selectivity in depressive states",
    reference: "Leuchter 2012",
  },
};

export const CONCEPT_ALIASES = {
  FAA: "FAA",
  "Frontal Alpha Asymmetry": "FAA",
  Theta: "Theta",
  "Frontal Theta Power": "Theta",
  Alpha_Power: "Alpha_Power",
  "Alpha Power": "Alpha_Power",
  "Parieto-occipital Alpha": "Alpha_Power",
  Beta_Power: "Beta_Power",
  "Beta Power": "Beta_Power",
  "Frontal-central Beta": "Beta_Power",
  TBR: "TBR",
  "Theta/Beta Ratio": "TBR",
  Coherence: "Coherence",
  "Interhemispheric Alpha Coherence": "Coherence",
};

export function resolveConceptKey(name) {
  return CONCEPT_ALIASES[name] || name;
}

export function getConceptMeta(name) {
  const key = resolveConceptKey(name);
  return CONCEPT_META[key] || {
    key,
    label: key,
    fullName: key,
    description: key,
    channels: "—",
    band: "—",
    clinicalSignificance: "—",
    reference: "—",
  };
}

export function getClinicalFlagColor(flag) {
  if (flag === "STRONG_DRIVER") {
    return COLORS.danger;
  }
  if (flag === "MODERATE_DRIVER") {
    return COLORS.warning;
  }
  if (flag === "SUPPRESSOR") {
    return COLORS.primary;
  }
  return COLORS.neutral;
}

export function getConceptInterpretation(concept) {
  const meta = getConceptMeta(concept.name || concept.concept_name);
  if (concept.clinicalFlag === "STRONG_DRIVER") {
    return `${meta.fullName} shows a prominent pattern affecting ${meta.clinicalSignificance.toLowerCase()}.`;
  }
  if (concept.clinicalFlag === "MODERATE_DRIVER") {
    return `${meta.fullName} shows a moderate pattern linked to ${meta.clinicalSignificance.toLowerCase()}.`;
  }
  if (concept.clinicalFlag === "SUPPRESSOR") {
    return `${meta.fullName} appears relatively preserved and may reflect reduced expression of this brain pattern.`;
  }
  if (concept.clinicalFlag === "NEUTRAL") {
    return `${meta.fullName} does not show a clear clinically meaningful pattern in this recording.`;
  }
  return `${meta.fullName} shows a mild or mixed pattern without a strong clinical signal.`;
}
