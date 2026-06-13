import { useCallback, useEffect, useRef, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Glossary from "./pages/Glossary";
import History from "./pages/History";
import Login from "./pages/Login";
import Results from "./pages/Results";
import Upload from "./pages/Upload";
import GlossaryModal from "./components/GlossaryModal";
import { APP_PAGES, getConceptInterpretation, getConceptMeta, resolveConceptKey } from "./utils/constants";
import {
  clearSessions,
  clearAuth,
  deleteSession,
  loadAuth,
  loadSessions,
  loadTheme,
  saveAuth,
  saveTheme,
  upsertSession,
} from "./utils/storage";

const PAGE_TITLES = {
  dashboard: "Dashboard",
  upload: "New Analysis",
  results: "Results",
  history: "History",
  glossary: "Glossary",
};

const STAGE_LABELS = [
  "Upload saved",
  "Model loaded",
  "EEG segmented",
  "Prediction complete",
  "Concepts computed",
  "Report generated",
];

function createInitialStages() {
  return STAGE_LABELS.map((label, index) => ({
    label,
    index,
    status: "pending",
    startedAt: null,
    completedAt: null,
  }));
}

function createInitialRunState() {
  return {
    loading: false,
    error: "",
    progress: 0,
    jobId: null,
    currentMessage: "",
    stages: createInitialStages(),
  };
}

function getRouteFromHash() {
  const hash = window.location.hash.replace("#", "");
  return PAGE_TITLES[hash] ? hash : "dashboard";
}

function buildApiBase(baseUrl) {
  const trimmed = (baseUrl || "http://localhost:8000").replace(/\/$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const API_BASE = "/api";

function authHeaders(auth) {
  return auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {};
}

function getStageIndex(progress) {
  if (progress < 12) {
    return 0;
  }
  if (progress < 25) {
    return 1;
  }
  if (progress < 55) {
    return 2;
  }
  if (progress < 88) {
    return 3;
  }
  if (progress < 100) {
    return 4;
  }
  return 5;
}

function parseReportSections(report) {
  if (!report) {
    return null;
  }
  if (typeof report === "string") {
    return { raw_report_text: report };
  }
  const clinicalInterpretation = [
    report.key_findings || "",
    report.clinical_interpretation || "",
  ].filter(Boolean).join("\n\n");

  return {
    patient_recording_information: report.patient_recording_information || "",
    model_prediction_summary: report.model_prediction_summary || "",
    concept_based_explanation: report.concept_based_explanation || "",
    clinical_interpretation: clinicalInterpretation,
    confidence_reliability_assessment: report.confidence_reliability_assessment || "",
    safety_disclaimer: report.safety_disclaimer || "",
    raw_report_text: report.raw_report_text || "",
  };
}

function normalizeProbability(value) {
  const numeric = Number(value || 0);
  if (numeric > 1) {
    return numeric / 100;
  }
  return numeric;
}

function normalizeConfidence(value) {
  const numeric = Number(value || 0);
  return numeric <= 1 ? numeric * 100 : numeric;
}

function formatReportText(reportSections) {
  if (!reportSections) {
    return "";
  }
  return [
    `Patient & Recording Information\n${reportSections.patient_recording_information}`,
    `Clinical Summary\n${reportSections.model_prediction_summary}`,
    `Biomarker Interpretation\n${reportSections.concept_based_explanation}`,
    `Clinical Interpretation\n${reportSections.clinical_interpretation}`,
    `Safety Disclaimer\n${reportSections.safety_disclaimer}`,
    reportSections.raw_report_text ? `Raw Report Text\n${reportSections.raw_report_text}` : "",
  ].join("\n\n");
}

function normalizeConcepts(result, predictionLabel) {
  const explanationConcepts = result.raw_explanation?.concepts || result.concepts || {};
  const tcavConcepts = Array.isArray(result.tcav_concepts) ? result.tcav_concepts : [];

  if (Array.isArray(explanationConcepts)) {
    return explanationConcepts.map((concept) => ({
      name: resolveConceptKey(concept.concept_name || concept.name),
      tcavScore: Number(concept.tcav_score || 0),
      meanDd: Number(concept.mean_derivative || concept.mean_dd || 0),
      stdDd: Number(concept.std_dd || concept.tcav_std || 0),
      clinicalFlag: concept.clinical_flag || "WEAK",
      segmentDd: concept.segment_dd || [],
      predictionLabel,
    }));
  }

  const names = Object.keys(explanationConcepts);
  if (names.length > 0) {
    return names.map((name) => {
      const source = explanationConcepts[name];
      return {
        name: resolveConceptKey(name),
        tcavScore: Number(source.tcav_score || 0),
        meanDd: Number(source.mean_dd || 0),
        stdDd: Number(source.std_dd || 0),
        clinicalFlag: source.clinical_flag || "WEAK",
        segmentDd: Array.isArray(source.segment_dd) ? source.segment_dd : [],
        predictionLabel,
      };
    });
  }

  return tcavConcepts.map((concept) => ({
    name: resolveConceptKey(concept.concept_name || concept.name),
    tcavScore: Number(concept.tcav_score || 0),
    meanDd: Number(concept.mean_derivative || concept.mean_dd || 0),
    stdDd: Number(concept.std_dd || concept.tcav_std || 0),
    clinicalFlag: concept.clinical_flag || "WEAK",
    segmentDd: Array.isArray(concept.segment_dd) ? concept.segment_dd : [],
    predictionLabel,
  }));
}

function normalizeAnalysis(result, report, subjectFallback, jobId = null) {
  const explanation = result.raw_explanation || result;
  const predictionLabel = result.prediction?.label || result.prediction || "Healthy";
  const probabilities = result.prediction?.probabilities || [];
  const mddProb = normalizeProbability(explanation.mdd_prob || result.mdd_prob || probabilities[1] || 0);
  const hcProb = normalizeProbability(explanation.hc_prob || result.hc_prob || probabilities[0] || 0);
  const confidence = normalizeConfidence(explanation.confidence || result.confidence || result.prediction?.confidence || 0);
  const nSegments = Number(explanation.n_segments || result.n_segments || explanation.segment_mdd_probs?.length || 0);
  const subject = result.subject_id || explanation.subject || subjectFallback || "Unknown subject";
  const reportSections = parseReportSections(report);
  const concepts = normalizeConcepts(result, predictionLabel).map((concept) => ({
    ...concept,
    meta: getConceptMeta(concept.name),
    interpretation: getConceptInterpretation(concept),
  }));

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    jobId,
    subject,
    createdAt: new Date().toISOString(),
    prediction: predictionLabel,
    confidence,
    mddProb,
    hcProb,
    nSegments,
    recordingSeconds: Number(explanation.recording_s || result.recording_s || nSegments * 5),
    segmentProbabilities: explanation.segment_mdd_probs || result.segment_mdd_probs || [],
    concepts,
    reportSections,
    reportText: result.report_text || formatReportText(reportSections),
    rawResult: result,
  };
}

function normalizeHistoryItem(item) {
  if (!item.result) {
    return null;
  }
  const normalized = normalizeAnalysis(
    item.result,
    item.report,
    item.subject_id,
    item.job_id,
  );
  return {
    ...normalized,
    id: item.job_id,
    createdAt: item.completed_at || item.created_at || normalized.createdAt,
  };
}

function updateStageStates(previousStages, progress) {
  const now = Date.now();
  const activeIndex = getStageIndex(progress);

  return previousStages.map((stage, index) => {
    const next = { ...stage };
    if (index < activeIndex || progress >= 100) {
      next.status = "complete";
      next.startedAt = next.startedAt || now;
      next.completedAt = next.completedAt || now;
      return next;
    }
    if (index === activeIndex) {
      next.status = "active";
      next.startedAt = next.startedAt || now;
      if (progress >= 100) {
        next.status = "complete";
        next.completedAt = next.completedAt || now;
      }
      return next;
    }
    return next;
  });
}

export default function App() {
  const [route, setRoute] = useState(getRouteFromHash());
  const [auth, setAuth] = useState(loadAuth());
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [theme, setTheme] = useState(loadTheme());
  const [sessions, setSessions] = useState(loadSessions());
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [healthStatus, setHealthStatus] = useState("checking");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 900);
  const [runState, setRunState] = useState(createInitialRunState());
  const [glossaryModal, setGlossaryModal] = useState(null);
  const streamRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!auth?.accessToken) {
      setSessions([]);
      setCurrentAnalysis(null);
      return;
    }

    let active = true;
    async function loadUserHistory() {
      try {
        const response = await fetch(`${API_BASE}/history`, {
          headers: authHeaders(auth),
        });
        if (response.status === 401) {
          handleLogout();
          return;
        }
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Could not load history");
        }
        const nextSessions = data.analyses
          .map(normalizeHistoryItem)
          .filter(Boolean);
        if (active) {
          setSessions(nextSessions);
          if (route === "results" && nextSessions.length > 0) {
            setCurrentAnalysis(nextSessions[0]);
          }
        }
      } catch (error) {
        if (active) {
          setAuthError(error.message);
        }
      }
    }

    loadUserHistory();
    return () => {
      active = false;
    };
  }, [auth?.accessToken]);

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash());
    const onResize = () => {
      if (window.innerWidth < 900) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (route === "results" && !currentAnalysis && sessions.length > 0) {
      setCurrentAnalysis(sessions[0]);
    }
  }, [currentAnalysis, route, sessions]);

  useEffect(() => {
    let active = true;

    async function ping() {
      try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        if (active) {
          setHealthStatus(data.status === "ok" ? "online" : "offline");
        }
      } catch (error) {
        if (active) {
          setHealthStatus("offline");
        }
      }
    }

    ping();
    const timer = window.setInterval(ping, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const navigate = useCallback((nextRoute) => {
    window.location.hash = nextRoute;
    setRoute(nextRoute);
  }, []);

  const handleAuthSubmit = useCallback(async ({ email, password, mode }) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await fetch(`${API_BASE}/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed");
      }
      const nextAuth = {
        accessToken: data.access_token,
        user: data.user,
      };
      saveAuth(nextAuth);
      setAuth(nextAuth);
      navigate("dashboard");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }, [navigate]);

  const handleLogout = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    clearAuth();
    setAuth(null);
    setSessions([]);
    setCurrentAnalysis(null);
    setRunState(createInitialRunState());
    setAuthError("");
  }, []);

  const handleThemeToggle = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const handleDeleteSession = useCallback((sessionId) => {
    const next = deleteSession(sessionId);
    setSessions(next);
    if (currentAnalysis && currentAnalysis.id === sessionId) {
      setCurrentAnalysis(null);
    }
  }, [currentAnalysis]);

  const handleClearAll = useCallback(() => {
    setSessions(clearSessions());
    setCurrentAnalysis(null);
  }, []);

  const handleViewSession = useCallback((sessionId) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    setCurrentAnalysis(session);
    navigate("results");
  }, [navigate, sessions]);

  const handleResetRun = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setRunState(createInitialRunState());
  }, []);

  const handleStartAnalysis = useCallback(async (file, subjectName) => {
    handleResetRun();
    setRunState((prev) => ({
      ...prev,
      loading: true,
      progress: 1,
      currentMessage: "Saving upload.",
      stages: updateStageStates(createInitialStages(), 1),
    }));
    navigate("upload");

    const form = new FormData();
    form.append("file", file);
    form.append("subject_id", subjectName);

    try {
      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: authHeaders(auth),
        body: form,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      if (data.job_id) {
        setRunState((prev) => ({
          ...prev,
          jobId: data.job_id,
        }));
        const stream = new EventSource(`${API_BASE}/stream/${data.job_id}?token=${encodeURIComponent(auth.accessToken)}`);
        streamRef.current = stream;

        stream.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          if (payload.message === "done") {
            stream.close();
            streamRef.current = null;
            const normalized = normalizeAnalysis(payload.result, payload.report, subjectName, data.job_id);
            const saved = upsertSession(normalized);
            setSessions(saved);
            setCurrentAnalysis(normalized);
            setRunState({
              loading: false,
              error: "",
              progress: 100,
              jobId: null,
              currentMessage: "Report generated successfully.",
              stages: updateStageStates(createInitialStages(), 100),
            });
            navigate("results");
            return;
          }

          if (payload.message === "canceled") {
            stream.close();
            streamRef.current = null;
            setRunState((prev) => ({
              ...prev,
              loading: false,
              error: "Analysis canceled.",
              progress: payload.progress || prev.progress,
              jobId: null,
              currentMessage: "Analysis canceled.",
            }));
            return;
          }

          if (typeof payload.message === "string" && payload.message.startsWith("error:")) {
            stream.close();
            streamRef.current = null;
            setRunState((prev) => ({
              ...prev,
              loading: false,
              error: payload.message,
              jobId: null,
              currentMessage: payload.message,
            }));
            return;
          }

          setRunState((prev) => ({
            ...prev,
            progress: payload.progress || prev.progress,
            currentMessage: payload.message || prev.currentMessage,
            stages: updateStageStates(prev.stages, payload.progress || 0),
          }));
        };

        stream.onerror = () => {
          stream.close();
          streamRef.current = null;
          setRunState((prev) => ({
            ...prev,
            loading: false,
            error: "Connection lost while streaming analysis progress.",
            jobId: null,
            currentMessage: "Connection lost while streaming analysis progress.",
          }));
        };
        return;
      }

      const normalized = normalizeAnalysis(data, null, subjectName, data.job_id || null);
      const saved = upsertSession(normalized);
      setSessions(saved);
      setCurrentAnalysis(normalized);
      setRunState({
        loading: false,
        error: "",
        progress: 100,
        jobId: null,
        currentMessage: "Report generated successfully.",
        stages: updateStageStates(createInitialStages(), 100),
      });
      navigate("results");
    } catch (error) {
      setRunState((prev) => ({
        ...prev,
        loading: false,
        error: error.message,
        jobId: null,
        currentMessage: error.message,
      }));
    }
  }, [auth, handleResetRun, navigate]);

  const handleCancelAnalysis = useCallback(async () => {
    const jobId = runState.jobId;
    if (!jobId) {
      handleResetRun();
      return;
    }

    try {
      await fetch(`${API_BASE}/cancel/${jobId}`, {
        method: "POST",
        headers: authHeaders(auth),
      });
    } catch (error) {
    }

    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setRunState((prev) => ({
      ...prev,
      loading: false,
      error: "Analysis canceled.",
      jobId: null,
      currentMessage: "Analysis canceled.",
    }));
  }, [auth, handleResetRun, runState.jobId]);

  if (!auth?.accessToken) {
    return (
      <Login
        onSubmit={handleAuthSubmit}
        error={authError}
        loading={authLoading}
      />
    );
  }

  const renderPage = () => {
    if (route === "dashboard") {
      return (
        <Dashboard
          sessions={sessions}
          onStartNew={() => navigate("upload")}
          onViewSession={handleViewSession}
          onDeleteSession={handleDeleteSession}
        />
      );
    }
    if (route === "upload") {
      return (
        <Upload
          onAnalyze={handleStartAnalysis}
          runState={runState}
          onRetry={handleResetRun}
          onCancel={handleCancelAnalysis}
        />
      );
    }
    if (route === "results") {
      return <Results analysis={currentAnalysis} authToken={auth.accessToken} />;
    }
    if (route === "history") {
      return (
        <History
          sessions={sessions}
          onViewSession={handleViewSession}
          onDeleteSession={handleDeleteSession}
          onClearAll={handleClearAll}
        />
      );
    }
    if (route === "glossary") {
      return <Glossary onOpenConcept={setGlossaryModal} />;
    }
    return <Glossary onOpenConcept={setGlossaryModal} />;
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">MM</div>
          {!sidebarCollapsed && (
            <div>
              <div className="brand-name">MentalMetrics</div>
              <div className="brand-subtitle">Clinical EEG review</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {APP_PAGES.map((page) => (
            <button
              key={page.key}
              type="button"
              className={`nav-item ${route === page.key ? "active" : ""}`}
              onClick={() => navigate(page.key)}
            >
              <span className="nav-icon">{page.icon}</span>
              {!sidebarCollapsed && <span>{page.label}</span>}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="ghost-button sidebar-toggle"
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          {sidebarCollapsed ? "Expand" : "Collapse"}
        </button>
      </aside>

      <div className="app-main-shell">
        <header className="topbar">
          <div>
            <div className="topbar-title">{PAGE_TITLES[route]}</div>
          </div>
          <div className="topbar-actions">
            <button type="button" className="secondary-button" onClick={handleThemeToggle}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              Logout
            </button>
            <div className={`status-indicator ${healthStatus}`}>
              <span className="status-dot" />
              <span>{healthStatus === "online" ? "Connected" : healthStatus === "checking" ? "Checking" : "Offline"}</span>
            </div>
          </div>
        </header>

        <main className="content-area">
          {renderPage()}
        </main>
      </div>

      <GlossaryModal conceptName={glossaryModal} onClose={() => setGlossaryModal(null)} />
    </div>
  );
}
