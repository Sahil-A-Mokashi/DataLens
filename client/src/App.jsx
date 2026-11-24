
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Database,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  X,
  RefreshCw,
  Download,
  Sparkles
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("datalens_token") || ""
  );
  const [user, setUser] = useState(
    () => JSON.parse(sessionStorage.getItem("datalens_user") || "null")
  );

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [cleaningPreview, setCleaningPreview] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
const [columnStrategies, setColumnStrategies] = useState({});
const [invalidStrategies, setInvalidStrategies] = useState({});
const [outlierStrategies, setOutlierStrategies] = useState({});
const [schemaSectionOpen, setSchemaSectionOpen] = useState(true);
const [missingSectionOpen, setMissingSectionOpen] = useState(false);
const [invalidSectionOpen, setInvalidSectionOpen] = useState(false);
const [outlierSectionOpen, setOutlierSectionOpen] = useState(false);
const [invalidColumnView, setInvalidColumnView] = useState("");
const [outlierColumnView, setOutlierColumnView] = useState("");
const [invalidViewAllRows, setInvalidViewAllRows] = useState(false);
const [outlierViewAllRows, setOutlierViewAllRows] = useState(false);
const [invalidExcludedRows, setInvalidExcludedRows] = useState({});
const [outlierExcludedRows, setOutlierExcludedRows] = useState({});
const [columnManagerOpen, setColumnManagerOpen] = useState(false);
const [newColumn, setNewColumn] = useState({ name: "", type: "fixed", value: "", start: "1", step: "1", startDate: "", interval: "daily", formula: "" });
const [renameDrafts, setRenameDrafts] = useState({});
const [deletingDataset, setDeletingDataset] = useState(false);

const [schemaSelections, setSchemaSelections] = useState({});
const [schemaResults, setSchemaResults] = useState({});
const [schemaLoading, setSchemaLoading] = useState({});

const cleaningPanelRef = useRef(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [authLoading, setAuthLoading] = useState(false);

  const [openDataQuery, setOpenDataQuery] = useState("transport");
  const [openDataResults, setOpenDataResults] = useState([]);
  const [openDataTotal, setOpenDataTotal] = useState(0);
  const [openDataLoading, setOpenDataLoading] = useState(false);
  const [openDataError, setOpenDataError] = useState("");

  async function apiRequest(path, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let errorMessage = "Something went wrong";

      if (contentType.includes("application/json")) {
        const data = await response.json();
        errorMessage = data.message || errorMessage;
      } else {
        errorMessage = await response.text();
      }

      throw new Error(errorMessage);
    }

    return response;
  }

  async function loadDatasets() {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest("/api/datasets");
      const data = await response.json();

      setDatasets(data.datasets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadDatasets();
    }
  }, [token]);

useEffect(() => {
  if (selectedDataset) {
    requestAnimationFrame(() => {
      cleaningPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }
}, [selectedDataset]);

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setError("");

    try {
      const endpoint =
        authMode === "login" ? "/api/auth/login" : "/api/auth/register";

      const body =
        authMode === "login"
          ? {
              email: authForm.email,
              password: authForm.password
            }
          : authForm;

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Authentication failed");
      }

      sessionStorage.setItem("datalens_token", data.token);
      sessionStorage.setItem("datalens_user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
      setAuthForm({ name: "", email: "", password: "" });
      setMessage("Welcome to DataLens.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("datalens_token");
    sessionStorage.removeItem("datalens_user");

    setToken("");
    setUser(null);
    setDatasets([]);
    setSelectedDataset(null);
    setCleaningPreview(null);
    setMessage("");
    setError("");
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setError("");
    setMessage("");

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);

    try {
      const response = await apiRequest("/api/datasets/upload", {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      setMessage(data.message || "Dataset uploaded successfully.");
      await loadDatasets();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }


  async function openCleaningPreview(dataset) {
    setSelectedDataset(dataset);
    setCleaningPreview(null);
    setVersions([]);
    setSelectedVersion(null);
    setError("");
    setMessage("");

    try {
      const [previewResponse, versionsResponse, detailResponse] = await Promise.all([
        apiRequest(`/api/datasets/${dataset._id}/cleaning-preview`),
        apiRequest(`/api/datasets/${dataset._id}/versions`),
        apiRequest(`/api/datasets/${dataset._id}`)
      ]);

      const previewData = await previewResponse.json();
      const versionsData = await versionsResponse.json();
      const detailData = await detailResponse.json();
      setSelectedDataset(detailData.dataset || dataset);

      setCleaningPreview(previewData.preview);
      setMissingSectionOpen((previewData.preview.missingColumns || []).length > 0);
      setInvalidSectionOpen((previewData.preview.schemaColumns || []).length > 0);
      setOutlierSectionOpen((previewData.preview.outlierColumns || []).length > 0);
      setInvalidColumnView(previewData.preview.schemaColumns?.[0]?.column || "");
      setOutlierColumnView(previewData.preview.outlierColumns?.[0]?.column || "");
      setInvalidViewAllRows(false);
      setOutlierViewAllRows(false);
      setInvalidExcludedRows({});
      setOutlierExcludedRows({});

      const initialStrategies = {};

      (previewData.preview.missingColumns || []).forEach(item => {
        const available = item.availableStrategies || [];

        const suggestedMethod = available.some(
          option => option.value === item.suggestedMethod
        )
          ? item.suggestedMethod
          : available[0]?.value || "keep";

        initialStrategies[item.column] = {
          method: suggestedMethod,
          value: ""
        };
      });


      setColumnStrategies(initialStrategies);

      const sortedVersions = [...(versionsData.versions || [])].sort(
        (a, b) => b.versionNumber - a.versionNumber
      );
      setVersions(sortedVersions);
      setSelectedVersion(sortedVersions[0] || null);

      const initialInvalidStrategies = {};
      (previewData.preview.schemaColumns || []).forEach(item => {
        initialInvalidStrategies[item.column] = {
          method: "keep",
          expectedType: ["numeric", "categorical", "boolean", "date"].includes(item.inferredType)
            ? item.inferredType
            : "",
          value: ""
        };
      });
      setInvalidStrategies(initialInvalidStrategies);

      const initialOutlierStrategies = {};
      (previewData.preview.outlierColumns || []).forEach(item => {
        initialOutlierStrategies[item.column] = {
          method: "keep",
          value: ""
        };
      });
      setOutlierStrategies(initialOutlierStrategies);
    } catch (err) {
      setError(err.message);
    }
  }



async function validateSchema(column) {
  if (!selectedDataset) return;

  const profile = selectedDataset.profile?.find(
    item => item.column === column
  );

  const expectedType =
    schemaSelections[column] ||
    (["numeric", "categorical", "boolean", "date"].includes(profile?.inferredType)
      ? profile.inferredType
      : "");

  if (!expectedType) {
    setError("Please select an expected data type first.");
    return;
  }

  setSchemaSelections(previous => ({
    ...previous,
    [column]: expectedType
  }));

  setSchemaLoading(previous => ({
    ...previous,
    [column]: true
  }));

  setError("");

  try {
    const response = await apiRequest(
      `/api/datasets/${selectedDataset._id}/validate-schema`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column, expectedType })
      }
    );

    const data = await response.json();

    setSchemaResults(previous => ({
      ...previous,
      [column]: data.validation
    }));
  } catch (err) {
    setError(err.message);
  } finally {
    setSchemaLoading(previous => ({
      ...previous,
      [column]: false
    }));
  }
}



  async function applyCleaning() {
    if (!selectedDataset) return;

    setCleaning(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/datasets/${selectedDataset._id}/clean`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            columnStrategies,
            invalidStrategies: Object.fromEntries(
              Object.entries(invalidStrategies).map(([column, strategy]) => [
                column,
                { ...strategy, excludedRows: invalidExcludedRows[column] || [] }
              ])
            ),
            outlierStrategies: Object.fromEntries(
              Object.entries(outlierStrategies).map(([column, strategy]) => [
                column,
                { ...strategy, excludedRows: outlierExcludedRows[column] || [] }
              ])
            ),
            removeDuplicates: true
          })
        }
      );

      const data = await response.json();

      setMessage(
        `Cleaning complete. Version ${data.version.versionNumber} created.`
      );

      const refreshedDatasetsResponse = await apiRequest("/api/datasets");
      const refreshedDatasetsData = await refreshedDatasetsResponse.json();
      const refreshedDatasets = refreshedDatasetsData.datasets || [];
      setDatasets(refreshedDatasets);
      const refreshedSelected = refreshedDatasets.find(item => item._id === selectedDataset._id);
      if (refreshedSelected) setSelectedDataset(refreshedSelected);

      const versionsResponse = await apiRequest(
        `/api/datasets/${selectedDataset._id}/versions`
      );
      const versionsData = await versionsResponse.json();

      const sortedVersions = [...(versionsData.versions || [])].sort(
        (a, b) => b.versionNumber - a.versionNumber
      );
      setVersions(sortedVersions);
      setSelectedVersion(sortedVersions[0] || null);

      const previewResponse = await apiRequest(
        `/api/datasets/${selectedDataset._id}/cleaning-preview`
      );
      const previewData = await previewResponse.json();
      const detailResponse = await apiRequest(`/api/datasets/${selectedDataset._id}`);
      const detailData = await detailResponse.json();
      setSelectedDataset(detailData.dataset || selectedDataset);
      setCleaningPreview(previewData.preview);
    } catch (err) {
      setError(err.message);
    } finally {
      setCleaning(false);
    }
  }


  async function refreshSelectedDataset() {
    if (!selectedDataset) return;
    const [datasetResponse, previewResponse, versionsResponse] = await Promise.all([
      apiRequest(`/api/datasets/${selectedDataset._id}`),
      apiRequest(`/api/datasets/${selectedDataset._id}/cleaning-preview`),
      apiRequest(`/api/datasets/${selectedDataset._id}/versions`)
    ]);
    const datasetData = await datasetResponse.json();
    const previewData = await previewResponse.json();
    const versionsData = await versionsResponse.json();
    setSelectedDataset(datasetData.dataset);
    setCleaningPreview(previewData.preview);
    const sorted = [...(versionsData.versions || [])].sort((a, b) => b.versionNumber - a.versionNumber);
    setVersions(sorted);
    setSelectedVersion(sorted[0] || null);
    await loadDatasets();
  }

  async function deleteSelectedDataset(dataset = selectedDataset) {
    if (!dataset) return;
    const confirmed = window.confirm(`Delete "${dataset.name}" and all its version history? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingDataset(true);
    setError("");
    try {
      await apiRequest(`/api/datasets/${dataset._id}`, { method: "DELETE" });
      setDatasets(previous => previous.filter(item => item._id !== dataset._id));
      if (selectedDataset?._id === dataset._id) {
        setSelectedDataset(null);
        setCleaningPreview(null);
        setVersions([]);
        setSelectedVersion(null);
      }
      setMessage(`"${dataset.name}" and its version history were deleted.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingDataset(false);
    }
  }

  async function runColumnOperation(path, body, successMessage) {
    if (!selectedDataset) return;
    setError("");
    setMessage("");
    try {
      const response = await apiRequest(`/api/datasets/${selectedDataset._id}/columns/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      setMessage(`${successMessage} New version ${data.versionNumber} created.`);
      await refreshSelectedDataset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addSchemaColumn(event) {
    event.preventDefault();
    await runColumnOperation("add", newColumn, "Column added.");
    setNewColumn({ name: "", type: "fixed", value: "", start: "1", step: "1", startDate: "", interval: "daily", formula: "" });
  }

  async function renameSchemaColumn(oldName) {
    const newName = (renameDrafts[oldName] || oldName).trim();
    if (!newName || newName === oldName) return;
    await runColumnOperation("rename", { oldName, newName }, "Column renamed.");
  }

  async function removeSchemaColumn(column) {
    if (!window.confirm(`Remove "${column}" from the active dataset? Its values will be archived and can be restored.`)) return;
    await runColumnOperation("remove", { column }, "Column removed.");
  }

  async function restoreSchemaColumn(column) {
    await runColumnOperation("restore", { column }, "Column restored.");
  }

  async function exportDataset(dataset, version) {
    try {
      setError("");

      const query = version ? `?version=${version}` : "";
      const response = await apiRequest(
        `/api/datasets/${dataset._id}/export${query}`
      );

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = version
        ? `${dataset.name}-version-${version}.csv`
        : `${dataset.name}-original.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage("CSV download started.");
    } catch (err) {
      setError(err.message);
    }
  }


async function searchOpenData(event) {
  event.preventDefault();

  if (openDataQuery.trim().length < 2) {
    setOpenDataError("Enter at least 2 characters.");
    return;
  }

  setOpenDataLoading(true);
  setOpenDataError("");
  setOpenDataResults([]);

  try {
    const response = await apiRequest(
      `/api/open-data/search?q=${encodeURIComponent(openDataQuery)}&rows=8`
    );

    const data = await response.json();

    setOpenDataResults(data.datasets || []);
    setOpenDataTotal(data.total || 0);
  } catch (err) {
    setOpenDataError(err.message);
  } finally {
    setOpenDataLoading(false);
  }
}


  const filteredDatasets = useMemo(
    () =>
      datasets.filter(dataset =>
        dataset.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [datasets, searchTerm]
  );

  const totalRows = datasets.reduce(
    (sum, item) => sum + (item.rowCount || 0),
    0
  );

  const totalIssues = datasets.reduce(
    (sum, item) =>
      sum +
      (item.issueSummary?.missingValues || 0) +
      (item.issueSummary?.duplicateRows || 0) +
      (item.issueSummary?.invalidValues || 0),
    0
  );

  const averageScore = datasets.length
    ? (
        datasets.reduce(
          (sum, item) => sum + (item.qualityScore || 0),
          0
        ) / datasets.length
      ).toFixed(1)
    : "0.0";

  const savedMetrics = selectedDataset?.qualityMetrics || {};
  const datasetMetrics = {
    completeness: typeof savedMetrics.completeness === "number" ? savedMetrics.completeness : null,
    uniqueness: typeof savedMetrics.uniqueness === "number" ? savedMetrics.uniqueness : null,
    schemaValidity: typeof savedMetrics.schemaCompliance === "number" ? savedMetrics.schemaCompliance : null
  };

  const highQualityCount = datasets.filter(
    dataset => dataset.qualityScore >= 95
  ).length;

  function getStatus(score) {
    if (score >= 95) return "Excellent";
    if (score >= 85) return "Good";
    return "Needs review";
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-icon datalens-brand-icon">
              <Database size={26} className="brand-database-mark" />
              <Search size={14} className="brand-lens-mark" />
            </div>
            <span>Data<span className="brand-light">Lens</span></span>
          </div>

          <p className="eyebrow">DATA QUALITY PLATFORM</p>
          <h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="subtitle">
            {authMode === "login"
              ? "Sign in to profile, analyse and improve your data quality."
              : "Create your workspace and start building better-quality datasets."}
          </p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleAuth} className="auth-form">
            {authMode === "register" && (
              <label>
                Full name
                <input
                  required
                  minLength={2}
                  value={authForm.name}
                  onChange={e =>
                    setAuthForm({ ...authForm, name: e.target.value })
                  }
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                required
                value={authForm.email}
                onChange={e =>
                  setAuthForm({ ...authForm, email: e.target.value })
                }
                placeholder="you@example.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                value={authForm.password}
                onChange={e =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
                placeholder="At least 8 characters"
              />
            </label>

            <button className="primary-button auth-submit" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
            {" "}
            <button
              className="text-button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {authMode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon datalens-brand-icon">
            <Database size={26} className="brand-database-mark" />
            <Search size={14} className="brand-lens-mark" />
          </div>
          <span>Data<span className="brand-light">Lens</span></span>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="navigation">
          <a className="nav-item active" href="#dashboard">
            <LayoutDashboard size={18} /> Dashboard
          </a>
          <a className="nav-item" href="#datasets">
            <Database size={18} /> Datasets
          </a>
          <a className="nav-item" href="#quality">
            <ShieldCheck size={18} /> Quality checks
          </a>
          <a className="nav-item" href="#reports">
            <FileCheck2 size={18} /> Reports
          </a>
          <a className="nav-item" href="#open-data">
            <Database size={18} /> Open Data Explorer
          </a>
        </nav>

        <div className="sidebar-bottom">
          <a className="nav-item" href="#settings">
            <Settings size={18} /> Settings
          </a>
          <a className="nav-item" href="#help">
            <CircleHelp size={18} /> Help & support
          </a>
          <div className="profile">
            <div className="avatar">
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-info">
              <strong>{user?.name || "Workspace user"}</strong>
              <span>{user?.email || "Data analyst"}</span>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="topbar-right">
            <span className="system-status">
              <span className="status-dot" /> API connected
            </span>
            <div className="avatar small">
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">DATA QUALITY & INTELLIGENCE</p>
            <h1>Data Quality Command Center</h1>
            <p className="subtitle">
              Profile, monitor, clean and prepare your data for reliable analytics and machine learning.
            </p>
          </div>

          <label className="primary-button upload-button">
            <Upload size={17} />
            {uploading ? "Uploading..." : "Upload dataset"}
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              disabled={uploading}
              hidden
            />
          </label>
        </section>

        {error && (
          <div className="error-message">
            <AlertCircle size={17} /> {error}
          </div>
        )}

        {message && (
          <div className="success-message">
            <CheckCircle2 size={17} /> {message}
            <button onClick={() => setMessage("")} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        <section className="metrics-grid">
          <MetricCard
            title="Total datasets"
            value={datasets.length}
            note="Your uploaded datasets"
            icon={<Database />}
          />
          <MetricCard
            title="Records analysed"
            value={totalRows.toLocaleString()}
            note="Across all datasets"
            icon={<FileSpreadsheet />}
          />
          <MetricCard
            title="Quality issues"
            value={totalIssues.toLocaleString()}
            note="Missing, duplicate and invalid values"
            icon={<AlertCircle />}
          />
          <MetricCard
            title="Average quality score"
            value={`${averageScore}%`}
            note="Average across your datasets"
            icon={<ShieldCheck />}
          />
        </section>

        <section className="content-grid">
          <div className="panel datasets-panel" id="datasets">
            <div className="panel-heading">
              <div>
                <h2>Recent datasets</h2>
                <p>Review the quality of your uploaded data.</p>
              </div>
              <button className="text-button" onClick={loadDatasets}>
                Refresh <RefreshCw size={15} />
              </button>
            </div>

            <div className="search-box">
              <Search size={17} />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search datasets..."
              />
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATASET</th>
                    <th>ROWS</th>
                    <th>ISSUES</th>
                    <th>QUALITY SCORE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="6" className="empty-state">Loading datasets...</td>
                    </tr>
                  )}

                  {!loading && filteredDatasets.map(dataset => {
                    const issues =
                      (dataset.issueSummary?.missingValues || 0) +
                      (dataset.issueSummary?.duplicateRows || 0) +
                      (dataset.issueSummary?.invalidValues || 0);

                    const status = getStatus(dataset.qualityScore || 0);

                    return (
                      <tr key={dataset._id}>
                        <td>
                          <div className="dataset-name">
                            <div className="table-file-icon">
                              <FileSpreadsheet size={17} />
                            </div>
                            <strong>{dataset.name}</strong>
                          </div>
                        </td>
                        <td>{(dataset.rowCount || 0).toLocaleString()}</td>
                        <td>
                          <span className={issues ? "issue-count" : "clean-count"}>
                            {issues}
                          </span>
                        </td>
                        <td>
                          <div className="score-cell">
                            <div className="score-track">
                              <div
                                className="score-fill"
                                style={{
                                  width: `${dataset.qualityScore || 0}%`
                                }}
                              />
                            </div>
                            <strong>{dataset.qualityScore || 0}%</strong>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              status === "Excellent"
                                ? "excellent"
                                : status === "Good"
                                  ? "good"
                                  : "review"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="text-button"
                              onClick={() => openCleaningPreview(dataset)}
                            >
                              Review
                            </button>
                            <button
                              className="text-button danger-text"
                              onClick={() => deleteSelectedDataset(dataset)}
                              disabled={deletingDataset}
                              title="Delete dataset and all versions"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filteredDatasets.length === 0 && (
                    <tr>
                      <td colSpan="6" className="empty-state">
                        No datasets found. Upload a CSV to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="right-column">
            <div className="panel overview-panel" id="quality">
              <div className="panel-heading">
                <div>
                  <h2>Quality overview</h2>
                  <p>Workspace health at a glance.</p>
                </div>
                <ChevronDown size={17} className="muted-icon" />
              </div>

              <div className="quality-ring" style={{ "--score": `${averageScore}%` }}>
                <div className="ring-inner">
                  <strong>{averageScore}%</strong>
                  <span>Average score</span>
                </div>
              </div>

              <div className="overview-footer">
                <span><span className="legend-dot" /> Overall dataset quality</span>
                <strong>{datasets.length} datasets</strong>
              </div>
            </div>

            <div className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Quick insights</h2>
                  <p>Current workspace summary.</p>
                </div>
              </div>

              <div className="insight-row">
                <div className="insight-icon warning">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <strong>{totalIssues} quality issues</strong>
                  <span>Across your datasets</span>
                </div>
              </div>

              <div className="insight-row">
                <div className="insight-icon success">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <strong>{highQualityCount} high-quality datasets</strong>
                  <span>Scoring 95% or above</span>
                </div>
              </div>

              <div className="insight-row">
                <div className="insight-icon neutral">
                  <Users size={18} />
                </div>
                <div>
                  <strong>{user?.name || "Workspace user"}</strong>
                  <span>Authenticated workspace</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        



        {selectedDataset && (
          <section
            ref={cleaningPanelRef}
            className="panel cleaning-panel"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">DATASET REVIEW</p>
                <h2>{selectedDataset.name}</h2>
                <p>Preview detected issues and apply cleaning.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setSelectedDataset(null);
                  setCleaningPreview(null);
                  setSelectedVersion(null);
                }}
                aria-label="Close dataset review"
              >
                <X size={18} />
              </button>
            </div>

            <div className="export-actions">
              <button
                className="secondary-button"
                onClick={() => exportDataset(selectedDataset)}
              >
                <Download size={16} /> Download original
              </button>
               {versions
              .filter(version => version.versionNumber > 1)
              .map(version => (
                <button
                  key={version.versionNumber}
                  className="secondary-button"
                  onClick={() =>
                    exportDataset(selectedDataset, version.versionNumber)
                  }
                >
                  <Download size={16} />
                  Download V{version.versionNumber}
                </button>
              ))}
            </div>

            
<div className="dataset-health-section">
  <div className="dataset-health-heading">
    <div>
      <p className="eyebrow">DATASET HEALTH</p>
      <h3>Current quality assessment</h3>
      <p>Measured quality indicators for this dataset.</p>
    </div>
    <div className="dataset-health-score">
      <strong>{selectedDataset.qualityScore == null ? "Not assessed" : `${Number(selectedDataset.qualityScore).toFixed(2)}%`}</strong>
      <span>Overall quality</span>
    </div>
  </div>

  <div className="dataset-health-grid">
    <div className="dataset-health-card">
      <span>Completeness</span>
      <strong>{datasetMetrics.completeness == null ? "Not assessed" : `${datasetMetrics.completeness.toFixed(2)}%`}</strong>
      <div className="health-track">
        <div style={{ width: `${datasetMetrics.completeness ?? 0}%` }} />
      </div>
    </div>

    <div className="dataset-health-card">
      <span>Uniqueness</span>
      <strong>{datasetMetrics.uniqueness == null ? "Not assessed" : `${datasetMetrics.uniqueness.toFixed(2)}%`}</strong>
      <div className="health-track">
        <div style={{ width: `${datasetMetrics.uniqueness ?? 0}%` }} />
      </div>
    </div>

    <div className="dataset-health-card">
      <span>Schema validity</span>
      <strong>
        {datasetMetrics.schemaValidity == null
          ? "Not assessed"
          : `${datasetMetrics.schemaValidity.toFixed(2)}%`}
      </strong>
      <div className="health-track">
        <div style={{
          width: `${datasetMetrics.schemaValidity ?? 0}%`
        }} />
      </div>
    </div>
    <div className="dataset-health-grid readiness-grid">
      <div className="dataset-health-card"><span>ML readiness estimate</span><strong>{typeof selectedDataset.mlReadiness?.score === "number" ? `${selectedDataset.mlReadiness.score.toFixed(2)}%` : "Not assessed"}</strong></div>
      <div className="dataset-health-card"><span>Potential readiness</span><strong>{typeof selectedDataset.mlReadiness?.potentialScore === "number" ? `${selectedDataset.mlReadiness.potentialScore.toFixed(2)}%` : "Not assessed"}</strong></div>
      <div className="dataset-health-card"><span>Improvement opportunity</span><strong>{typeof selectedDataset.mlReadiness?.improvementOpportunity === "number" ? `${selectedDataset.mlReadiness.improvementOpportunity.toFixed(2)}%` : "Not assessed"}</strong></div>
    </div>
  </div>
</div>

            <div className="version-history">
              <h3>Version history</h3>
              <p>Track changes made to this dataset.</p>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>VERSION</th>
                      <th>ROWS</th>
                      <th>QUALITY SCORE</th>
                      <th>MISSING VALUES FILLED</th>
                      <th>DUPLICATES REMOVED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...versions].sort((a, b) => b.versionNumber - a.versionNumber).map(version => (
                      <tr
                      key={version.versionNumber}
                      onClick={() => setSelectedVersion(version)}
                      className={`version-clickable-row ${selectedVersion?.versionNumber === version.versionNumber ? "selected-version-row" : ""}`}
>
                        <td>
                          <strong>{version.label}</strong>
                          {version.versionNumber === 1 && (
                            <span className="status-pill good">Original</span>
                          )}
                        </td>
                        <td>{version.rowCount ?? "—"}</td>
                        <td>
                          <strong>{version.qualityScore == null ? "Not assessed" : `${Number(version.qualityScore).toFixed(2)}%`}</strong>
                        </td>
                        <td>{version.changeSummary?.missingValuesFilled || 0}</td>
                        <td>{version.changeSummary?.duplicateRowsRemoved || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

{selectedVersion && (
  <div className="version-details">
    <div className="panel-heading">
      <div>
        <h3>{selectedVersion.label || `Version ${selectedVersion.versionNumber}`}</h3>
        <p>Selected version details</p>
      </div>
      <button
        className="text-button"
        onClick={() => setSelectedVersion(null)}
      >
        Close
      </button>
    </div>

    <div className="dataset-health-grid version-summary-grid">
      <div className="dataset-health-card"><span>Version</span><strong>V{selectedVersion.versionNumber}</strong></div>
      <div className="dataset-health-card"><span>Rows</span><strong>{selectedVersion.rowCount ?? "—"}</strong></div>
      <div className="dataset-health-card"><span>Quality score</span><strong>{selectedVersion.qualityScore == null ? "Not assessed" : `${Number(selectedVersion.qualityScore).toFixed(2)}%`}</strong></div>
      <div className="dataset-health-card"><span>Missing values filled</span><strong>{selectedVersion.changeSummary?.missingValuesFilled ?? 0}</strong></div>
      <div className="dataset-health-card"><span>Duplicates removed</span><strong>{selectedVersion.changeSummary?.duplicateRowsRemoved ?? 0}</strong></div>
      <div className="dataset-health-card"><span>Created</span><strong>{selectedVersion.createdAt ? new Date(selectedVersion.createdAt).toLocaleString() : "—"}</strong></div>
    </div>

    <h4 className="version-metrics-heading">Quality dimensions for this version</h4>
    <div className="dataset-health-grid version-metric-grid">
      {[
        { label: "Completeness", value: selectedVersion.qualityMetrics?.completeness },
        { label: "Uniqueness", value: selectedVersion.qualityMetrics?.uniqueness },
        { label: "Schema validity", value: selectedVersion.qualityMetrics?.schemaCompliance }
      ].map(metric => (
        <div className="dataset-health-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{typeof metric.value === "number" ? `${metric.value.toFixed(2)}%` : "Not assessed"}</strong>
          <div className="health-track"><div style={{ width: `${typeof metric.value === "number" ? Math.min(100, Math.max(0, metric.value)) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  </div>
)}

            </div>


            {cleaningPreview ? (
              <>
                <div className="preview-stats">
                  <div>
                    <span>Rows</span>
                    <strong>{cleaningPreview.totalRows}</strong>
                  </div>
                  <div>
                    <span>Missing values</span>
                    <strong>{cleaningPreview.missingValuesFound}</strong>
                  </div>
                  <div>
                    <span>Exact duplicate rows</span>
                    <strong>{cleaningPreview.duplicateRowsFound}</strong>
                  </div>
                </div>

<div className="schema-validation-section">
  <button className="section-toggle" type="button" onClick={() => setSchemaSectionOpen(value => !value)} aria-expanded={schemaSectionOpen}>
    <span><h3>Schema Validation</h3><small>{(selectedDataset.profile || []).length} columns in dataset</small></span>
    <ChevronDown className={schemaSectionOpen ? "section-chevron open" : "section-chevron"} size={18} />
  </button>
  {schemaSectionOpen && <>
  <p>
    Review automatically inferred data types or select an expected
    type manually to identify inconsistent values.
  </p>


  <div className="schema-manager">
    <div className="schema-manager-heading">
      <div>
        <h3>Column management</h3>
        <p>Add, rename, remove or restore columns. Every change creates a new dataset version.</p>
      </div>
      <button className="secondary-button" type="button" onClick={() => setColumnManagerOpen(value => !value)}>
        {columnManagerOpen ? "Hide tools" : "Manage columns"}
      </button>
    </div>
    {columnManagerOpen && <>
      <form className="schema-add-form" onSubmit={addSchemaColumn}>
        <label>New column name<input required maxLength="150" value={newColumn.name} onChange={e => setNewColumn(p => ({...p, name:e.target.value}))} placeholder="e.g. Region" /></label>
        <label>Creation method<select value={newColumn.type} onChange={e => setNewColumn(p => ({...p, type:e.target.value}))}>
          <option value="fixed">Same value for all rows</option><option value="increment">Numeric sequence</option><option value="date_sequence">Date sequence</option><option value="formula">Formula</option>
        </select></label>
        {newColumn.type === "fixed" && <label>Value<input value={newColumn.value} onChange={e => setNewColumn(p => ({...p, value:e.target.value}))} /></label>}
        {newColumn.type === "increment" && <><label>Start<input type="number" value={newColumn.start} onChange={e => setNewColumn(p => ({...p, start:e.target.value}))} /></label><label>Step<input type="number" value={newColumn.step} onChange={e => setNewColumn(p => ({...p, step:e.target.value}))} /></label></>}
        {newColumn.type === "date_sequence" && <><label>Start date<input type="date" required value={newColumn.startDate} onChange={e => setNewColumn(p => ({...p, startDate:e.target.value}))} /></label><label>Interval<select value={newColumn.interval} onChange={e => setNewColumn(p => ({...p, interval:e.target.value}))}><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></>}
        {newColumn.type === "formula" && <label className="schema-formula-field">Formula<input required value={newColumn.formula} onChange={e => setNewColumn(p => ({...p, formula:e.target.value}))} placeholder="e.g. Age * 2 + 5" /><small>Use numeric column names, numbers and + − × ÷ parentheses.</small></label>}
        <button className="primary-button" type="submit">Add column</button>
      </form>
      <div className="schema-column-management-list">
        {(selectedDataset.columns || []).map(column => <div className="schema-column-management-row" key={column}>
          <strong>{column}</strong>
          <input aria-label={`Rename ${column}`} value={renameDrafts[column] ?? column} onChange={e => setRenameDrafts(p => ({...p, [column]:e.target.value}))} />
          <button className="secondary-button" type="button" onClick={() => renameSchemaColumn(column)}>Rename</button>
          <button className="text-button danger-text" type="button" onClick={() => removeSchemaColumn(column)}>Remove</button>
        </div>)}
        {(selectedDataset.archivedColumns || []).length > 0 && <div className="archived-columns">
          <strong>Archived columns</strong>
          {(selectedDataset.archivedColumns || []).map(item => <div className="schema-column-management-row" key={item.name}>
            <span>{item.name}</span><span className="muted-copy">Archived</span>
            <button className="secondary-button" type="button" onClick={() => restoreSchemaColumn(item.name)}>Restore</button>
          </div>)}
        </div>}
      </div>
    </>}
  </div>

  <div className="schema-validation-list">
    {(selectedDataset.profile || []).map(profile => {
      const column = profile.column;

      const inferredType = profile.inferredType;
      const currentType =
        schemaSelections[column] ??
        (["numeric", "categorical", "boolean", "date"].includes(inferredType)
          ? inferredType
          : "");

      const result = schemaResults[column];
      const isLoading = schemaLoading[column];

      return (
        <div className="schema-validation-card" key={column}>
          <div className="schema-column-heading">
            <strong>{column}</strong>
            <span>
              Automatically detected: {inferredType}
            </span>
          </div>

          <div className="schema-controls">
            <label>
              Expected data type
              <select
                value={currentType}
                onChange={event => {
                  setSchemaSelections(previous => ({
                    ...previous,
                    [column]: event.target.value
                  }));

                  setSchemaResults(previous => ({
                    ...previous,
                    [column]: null
                  }));
                }}
              >
                <option value="">Select expected type</option>
                <option value="numeric">Numeric</option>
                <option value="categorical">Text / Categorical</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
              </select>
            </label>

            <button
              className="secondary-button"
              disabled={!currentType || isLoading}
              onClick={() => validateSchema(column)}
            >
              {isLoading ? "Validating..." : "Validate column"}
            </button>
          </div>

          {result && (
            <div className="schema-validation-results">
              <div className="schema-result-stats">
                <div>
                  <span>Valid values</span>
                  <strong>{result.validCount}</strong>
                </div>

                <div>
                  <span>Invalid values</span>
                  <strong>{result.mismatchCount}</strong>
                </div>

                <div>
                  <span>Mismatch rate</span>
                  <strong>{result.mismatchPercentage}%</strong>
                </div>
              </div>

              <div className={`schema-result-status ${
                result.status === "valid" ? "valid" : "invalid"
              }`}>
                              {result.status === "valid"
                                ? "All non-missing values match the selected type."
                                : result.status === "empty"
                                  ? "No non-missing values available to validate."
                                  : "Schema mismatch detected. Review the invalid values below."}
                            </div>

                            {result.mismatches?.length > 0 && (
                              <div className="table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>DATA ROW</th>
                                      <th>INVALID VALUE</th>
                                      <th>DETECTED TYPE</th>
                                      <th>EXPECTED TYPE</th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {result.mismatches.map((item, index) => (
                                      <tr key={`${item.row}-${index}`}>
                                        <td>{item.row}</td>
                                        <td>{item.value}</td>
                                        <td>{item.detectedType}</td>
                                        <td>{item.expectedType}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
  </>}
</div>

                <h3>Detected missing cells</h3>
                {cleaningPreview.missingCells.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>ROW</th><th>COLUMN</th></tr>
                      </thead>
                      <tbody>
                        {cleaningPreview.missingCells.map((cell, index) => (
                          <tr key={`${cell.row}-${cell.column}-${index}`}>
                            <td>{cell.row}</td>
                            <td>{cell.column}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No missing cells detected.</p>
                )}

                        
        <div className="column-cleaning-section">
          <button className="section-toggle" type="button" onClick={() => setMissingSectionOpen(value => !value)} aria-expanded={missingSectionOpen}>
            <span><h3>Missing Value Cleaning</h3><small>{cleaningPreview.missingValuesFound || 0} missing cells detected</small></span>
            <ChevronDown className={missingSectionOpen ? "section-chevron open" : "section-chevron"} size={18} />
          </button>
          {missingSectionOpen && <>
          <p>
            Select how DataLens should handle missing values in each column.
            You can choose a different method for every column.
          </p>

          {cleaningPreview.missingColumns?.length ? (
            cleaningPreview.missingColumns.map(item => {
              const selected = columnStrategies[item.column] || {
                method: item.suggestedMethod || "keep",
                value: ""
              };

              return (
                <div className="column-strategy-card" key={item.column}>
                  <div className="column-strategy-info">
                    <strong>{item.column}</strong>
                    <span>
                      {item.inferredType} · {item.missingCount} missing values
                      ({item.missingPercentage}%)
                    </span>
                  </div>

                  <label>
                    Cleaning method
                    <select
                      value={selected.method}
                      onChange={event =>
                        setColumnStrategies(previous => ({
                          ...previous,
                          [item.column]: {
                            ...previous[item.column],
                            method: event.target.value
                          }
                        }))
                      }
                    >
                      {item.availableStrategies.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selected.method === "custom" && (
                    <label>
                      Custom replacement value
                      <input
                        type="text"
                        value={selected.value || ""}
                        placeholder={`Enter replacement for ${item.column}`}
                        onChange={event =>
                          setColumnStrategies(previous => ({
                            ...previous,
                            [item.column]: {
                              ...previous[item.column],
                              method: "custom",
                              value: event.target.value
                            }
                          }))
                        }
                      />
                    </label>
                  )}
                </div>
              );
            })
          ) : (
            <p>No missing values require a column-specific strategy.</p>
          )}
          </>}
        </div>

        <div className="column-cleaning-section">
          <button className="section-toggle" type="button" onClick={() => setInvalidSectionOpen(value => !value)} aria-expanded={invalidSectionOpen}>
            <span><h3>Invalid Value Treatment</h3><small>{cleaningPreview.schemaColumns?.reduce((sum, item) => sum + (item.mismatchCount || 0), 0) || 0} detected type mismatches</small></span>
            <ChevronDown className={invalidSectionOpen ? "section-chevron open" : "section-chevron"} size={18} />
          </button>
          {invalidSectionOpen && <>
            <p>Choose how to handle values that do not match the expected data type. Select an expected type before applying a replacement.</p>
            {(cleaningPreview.schemaColumns || []).length ? cleaningPreview.schemaColumns.map(item => {
              const strategy = invalidStrategies[item.column] || { method: "keep", expectedType: "", value: "" };
              return <div className="column-strategy-card" key={`invalid-${item.column}`}>
                <div className="column-strategy-info"><strong>{item.column}</strong><span>{item.mismatchCount || 0} mismatched values</span></div>
                <label>Expected type<select value={strategy.expectedType} onChange={event => setInvalidStrategies(previous => ({ ...previous, [item.column]: { ...strategy, expectedType: event.target.value } }))}><option value="">Select type</option><option value="numeric">Numeric</option><option value="categorical">Text / Categorical</option><option value="boolean">Boolean</option><option value="date">Date</option></select></label>
                <label>Treatment<select value={strategy.method} onChange={event => setInvalidStrategies(previous => ({ ...previous, [item.column]: { ...strategy, method: event.target.value } }))}><option value="keep">Keep unchanged</option><option value="drop_rows">Remove affected rows</option><option value="mode">Replace with mode</option><option value="median">Replace with median</option><option value="mean">Replace with mean</option><option value="custom">Custom value</option></select></label>
                {strategy.method === "custom" && <label>Replacement value<input value={strategy.value || ""} onChange={event => setInvalidStrategies(previous => ({ ...previous, [item.column]: { ...strategy, value: event.target.value } }))} /></label>}
              </div>;
            }) : <p>No schema mismatches detected.</p>}
          </>}
        </div>


        <div className="column-cleaning-section">
          <button className="section-toggle" type="button" onClick={() => setInvalidSectionOpen(value => !value)} aria-expanded={invalidSectionOpen}>
            <span><h3>Invalid Value Treatment</h3><small>{cleaningPreview.schemaColumns?.reduce((sum, item) => sum + (item.mismatchCount || 0), 0) || 0} detected type mismatches</small></span>
            <ChevronDown className={invalidSectionOpen ? "section-chevron open" : "section-chevron"} size={18} />
          </button>
          {invalidSectionOpen && <>
            <p>Choose a column to inspect only its invalid rows, or switch to all rows. Exclude individual rows from treatment when a flagged value is legitimate.</p>
            {(cleaningPreview.schemaColumns || []).length ? <>
              <div className="issue-workspace">
                <div className="issue-column-list">
                  {(cleaningPreview.schemaColumns || []).map(item => <button type="button" key={item.column} className={`issue-column-button ${invalidColumnView === item.column ? "active" : ""}`} onClick={() => {setInvalidColumnView(item.column); setInvalidViewAllRows(false);}}>
                    <strong>{item.column}</strong><span>{item.mismatchCount || 0} invalid</span>
                  </button>)}
                </div>
                {(() => {
                  const item = cleaningPreview.schemaColumns.find(row => row.column === invalidColumnView) || cleaningPreview.schemaColumns[0];
                  const strategy = invalidStrategies[item.column] || {method:"keep", expectedType:item.inferredType || "", value:""};
                  const excluded = invalidExcludedRows[item.column] || [];
                  const invalidRows = item.mismatches || [];
                  const visibleRows = invalidViewAllRows
                    ? (selectedDataset.records || []).map((record, index) => ({row:index + 2, value:record[item.column], detectedType: "—", expectedType:strategy.expectedType, invalid:invalidRows.some(row => row.row === index + 2)}))
                    : invalidRows;
                  return <div className="issue-detail-panel">
                    <div className="issue-detail-heading"><div><h4>{item.column}</h4><p>{invalidRows.length} mismatched values · {excluded.length} excluded</p></div>
                      <label className="inline-check"><input type="checkbox" checked={invalidViewAllRows} onChange={e => setInvalidViewAllRows(e.target.checked)} /> Show all rows</label>
                    </div>
                    <div className="issue-controls">
                      <label>Expected type<select value={strategy.expectedType || ""} onChange={e => setInvalidStrategies(p => ({...p,[item.column]:{...strategy,expectedType:e.target.value}}))}><option value="">Select type</option><option value="numeric">Numeric</option><option value="categorical">Text / Categorical</option><option value="boolean">Boolean</option><option value="date">Date</option></select></label>
                      <label>Treatment<select value={strategy.method} onChange={e => setInvalidStrategies(p => ({...p,[item.column]:{...strategy,method:e.target.value}}))}><option value="keep">Keep unchanged</option><option value="drop_rows">Remove affected rows</option><option value="mode">Replace with mode</option><option value="median">Replace with median</option><option value="mean">Replace with mean</option><option value="custom">Custom value</option></select></label>
                      {strategy.method === "custom" && <label>Replacement value<input value={strategy.value || ""} onChange={e => setInvalidStrategies(p => ({...p,[item.column]:{...strategy,value:e.target.value}}))} /></label>}
                    </div>
                    <div className="table-wrap issue-rows-table"><table><thead><tr><th>Exclude</th><th>Row</th><th>Value</th><th>Detected type</th><th>Expected</th></tr></thead><tbody>
                      {visibleRows.map((row,index) => <tr key={`${row.row}-${index}`} className={row.invalid ? "issue-highlight-row" : ""}><td>{row.invalid ? <input type="checkbox" aria-label={`Exclude row ${row.row}`} checked={excluded.includes(row.row)} onChange={e => setInvalidExcludedRows(p => ({...p,[item.column]:e.target.checked?[...excluded,row.row]:excluded.filter(value=>value!==row.row)}))} /> : "—"}</td><td>{row.row}</td><td>{String(row.value ?? "")}</td><td>{row.detectedType || "—"}</td><td>{row.expectedType || strategy.expectedType || "—"}</td></tr>)}
                      {!visibleRows.length && <tr><td colSpan="5">No invalid values detected.</td></tr>}
                    </tbody></table></div>
                  </div>;
                })()}
              </div>
            </> : <p>No schema mismatches detected.</p>}
          </>}
        </div>

        <div className="column-cleaning-section">
          <button className="section-toggle" type="button" onClick={() => setOutlierSectionOpen(value => !value)} aria-expanded={outlierSectionOpen}>
            <span><h3>Outlier Treatment</h3><small>{cleaningPreview.totalOutliers || 0} detected outliers</small></span>
            <ChevronDown className={outlierSectionOpen ? "section-chevron open" : "section-chevron"} size={18} />
          </button>
          {outlierSectionOpen && <>
            <p>Review outliers column by column. Adjust lower and upper limits independently. Flagged rows are highlighted; exclude legitimate observations from treatment.</p>
            {(cleaningPreview.outlierColumns || []).length ? <>
              <div className="issue-workspace">
                <div className="issue-column-list">
                  {(cleaningPreview.outlierColumns || []).map(item => <button type="button" key={item.column} className={`issue-column-button ${outlierColumnView === item.column ? "active" : ""}`} onClick={() => {setOutlierColumnView(item.column);setOutlierViewAllRows(false);}}>
                    <strong>{item.column}</strong><span>{item.outlierCount} outliers</span>
                  </button>)}
                </div>
                {(() => {
                  const item = cleaningPreview.outlierColumns.find(row => row.column === outlierColumnView) || cleaningPreview.outlierColumns[0];
                  const strategy = outlierStrategies[item.column] || {method:"keep",value:"",lowerBound:item.lowerBound,upperBound:item.upperBound};
                  const excluded = outlierExcludedRows[item.column] || [];
                  const flagged = item.outliers || [];
                  const visibleRows = outlierViewAllRows
                    ? (selectedDataset.records || []).map((record,index) => ({row:index+2,value:record[item.column],direction:flagged.find(row=>row.row===index+2)?.direction, outlier:flagged.some(row=>row.row===index+2)}))
                    : flagged;
                  return <div className="issue-detail-panel">
                    <div className="issue-detail-heading"><div><h4>{item.column}</h4><p>{flagged.length} flagged values · {excluded.length} excluded</p></div>
                      <label className="inline-check"><input type="checkbox" checked={outlierViewAllRows} onChange={e=>setOutlierViewAllRows(e.target.checked)} /> Show all rows</label>
                    </div>
                    <div className="issue-controls">
                      <label>Lower constraint<input type="number" value={strategy.lowerBound ?? item.lowerBound ?? ""} onChange={e=>setOutlierStrategies(p=>({...p,[item.column]:{...strategy,lowerBound:e.target.value===""?null:Number(e.target.value)}}))} /></label>
                      <label>Upper constraint<input type="number" value={strategy.upperBound ?? item.upperBound ?? ""} onChange={e=>setOutlierStrategies(p=>({...p,[item.column]:{...strategy,upperBound:e.target.value===""?null:Number(e.target.value)}}))} /></label>
                      <label>Treatment<select value={strategy.method} onChange={e=>setOutlierStrategies(p=>({...p,[item.column]:{...strategy,method:e.target.value}}))}><option value="keep">Keep unchanged</option><option value="drop_rows">Remove affected rows</option><option value="median">Replace with median</option><option value="mean">Replace with mean</option><option value="mode">Replace with mode</option><option value="custom">Custom value</option></select></label>
                      {strategy.method==="custom" && <label>Replacement value<input value={strategy.value||""} onChange={e=>setOutlierStrategies(p=>({...p,[item.column]:{...strategy,value:e.target.value}}))}/></label>}
                    </div>
                    <div className="table-wrap issue-rows-table"><table><thead><tr><th>Exclude</th><th>Row</th><th>Value</th><th>Flag</th></tr></thead><tbody>
                      {visibleRows.map((row,index)=><tr key={`${row.row}-${index}`} className={row.outlier!==false && (row.outlier || flagged.some(flag=>flag.row===row.row)) ? "issue-highlight-row" : ""}><td>{(row.outlier || flagged.some(flag=>flag.row===row.row)) ? <input type="checkbox" aria-label={`Exclude row ${row.row}`} checked={excluded.includes(row.row)} onChange={e=>setOutlierExcludedRows(p=>({...p,[item.column]:e.target.checked?[...excluded,row.row]:excluded.filter(value=>value!==row.row)}))}/>:"—"}</td><td>{row.row}</td><td>{String(row.value ?? "")}</td><td>{row.direction || (row.outlier ? "Outlier" : "Within limits")}</td></tr>)}
                      {!visibleRows.length && <tr><td colSpan="4">No outliers detected.</td></tr>}
                    </tbody></table></div>
                  </div>;
                })()}
              </div>
            </> : <p>No outliers detected.</p>}
          </>}
        </div>

                <button
                  className="primary-button"
                  onClick={applyCleaning}
                  disabled={
                    cleaning ||
                    [...Object.values(columnStrategies), ...Object.values(invalidStrategies), ...Object.values(outlierStrategies)].some(
                      strategy => strategy.method === "custom" && !String(strategy.value || "").trim()
                    ) ||
                    Object.values(invalidStrategies).some(strategy => !strategy.expectedType)
                  }
                >
                  <Sparkles size={16} />
                  {cleaning ? "Applying..." : "Apply cleaning and create new version"}
                </button>
              </>
            ) : (
              <p>Loading cleaning preview...</p>
            )}
          </section>
        )}

        <section className="panel open-data-panel" id="open-data">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EXTERNAL API INTEGRATION</p>
              <h2>Open Data Explorer</h2>
              <p>Discover public datasets from Ireland's open-data catalogue.</p>
            </div>
            <div className="open-data-source">data.gov.ie</div>
          </div>

          <form className="open-data-search" onSubmit={searchOpenData}>
            <input
              type="search"
              value={openDataQuery}
              onChange={event => setOpenDataQuery(event.target.value)}
              placeholder="Search public datasets..."
              aria-label="Search public datasets"
            />
            <button
              className="primary-button"
              type="submit"
              disabled={openDataLoading}
            >
              {openDataLoading ? "Searching..." : "Search catalogue"}
            </button>
          </form>

          {openDataError && (
            <div className="error-message">
              <AlertCircle size={17} /> {openDataError}
            </div>
          )}

          {openDataLoading && <p>Searching the Irish open-data catalogue...</p>}

          {!openDataLoading && openDataResults.length > 0 && (
            <>
              <p className="open-data-count">
                Showing {openDataResults.length} results from {openDataTotal.toLocaleString()} matching catalogue records.
              </p>

              <div className="open-data-results">
                {openDataResults.map(dataset => (
                  <article className="open-data-card" key={dataset.id}>
                    <div className="open-data-card-heading">
                      <div>
                        <h3>{dataset.title}</h3>
                        <span>{dataset.organization}</span>
                      </div>
                      <span className="status-pill good">Public dataset</span>
                    </div>

                    <p className="open-data-description">
                      {dataset.description || "No description provided by the publisher."}
                    </p>

                    <div className="open-data-meta">
                      <span><strong>Licence:</strong> {dataset.license}</span>
                      <span>
                        <strong>Modified:</strong>{" "}
                        {dataset.modified
                          ? new Date(dataset.modified).toLocaleDateString()
                          : "Not specified"}
                      </span>
                    </div>

                    {dataset.tags?.length > 0 && (
                      <div className="open-data-tags">
                        {dataset.tags.slice(0, 5).map(tag => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}

                    {dataset.resources?.length > 0 && (
                      <div className="open-data-resources">
                        <strong>Available resources</strong>
                        {dataset.resources.slice(0, 4).map(resource => (
                          <a
                            key={resource.id}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {resource.name} ({resource.format})
                            <ArrowUpRight size={14} />
                          </a>
                        ))}
                      </div>
                    )}

                    <a
                      className="open-data-portal-link"
                      href={dataset.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View dataset on data.gov.ie <ArrowUpRight size={15} />
                    </a>
                  </article>
                ))}
              </div>
            </>
          )}

          {!openDataLoading && openDataResults.length === 0 && !openDataError && (
            <p className="open-data-empty">
              Search for transport, housing, population or other public datasets.
            </p>
          )}
        </section>

        <footer className="footer">
          <span>DataLens</span>
          <span>© 2026C Sahil Mokashi</span>
        </footer>
      </main>
    </div>
  );
}

function MetricCard({ title, value, note, icon }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <div className="metric-icon">{icon}</div>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </div>
  );
}

export default App;
