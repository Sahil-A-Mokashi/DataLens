
import { useEffect, useMemo, useState } from "react";
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
  const [replacement, setReplacement] = useState("Not provided");

  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [authLoading, setAuthLoading] = useState(false);

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

    if (file.size > 2 * 1024 * 1024) {
      setError("File size must be 2 MB or less.");
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
    setError("");
    setMessage("");

    try {
      const response = await apiRequest(
        `/api/datasets/${dataset._id}/cleaning-preview`
      );

      const data = await response.json();
      setCleaningPreview(data.preview);
    } catch (err) {
      setError(err.message);
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
            missingValueReplacement: replacement
          })
        }
      );

      const data = await response.json();

      setMessage(
        `Cleaning complete. Version ${data.version.versionNumber} created.`
      );

      setCleaningPreview(null);
      await loadDatasets();
    } catch (err) {
      setError(err.message);
    } finally {
      setCleaning(false);
    }
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
            <div className="brand-icon"><Activity size={22} /></div>
            <span>Data<span className="brand-light">Lens</span></span>
          </div>

          <p className="eyebrow">DATA QUALITY PLATFORM</p>
          <h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="subtitle">
            {authMode === "login"
              ? "Sign in to manage and assess your datasets."
              : "Register to start analysing your data."}
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
          <div className="brand-icon"><Activity size={22} /></div>
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
            <p className="eyebrow">DATA QUALITY PLATFORM</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              Monitor, assess and improve the quality of your datasets.
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
                          <button
                            className="text-button"
                            onClick={() => openCleaningPreview(dataset)}
                          >
                            Review
                          </button>
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
          <section className="panel cleaning-panel">
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
              <button
                className="secondary-button"
                onClick={() => exportDataset(selectedDataset, 2)}
              >
                <Download size={16} /> Download Version 2
              </button>
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

                <label className="replacement-field">
                  Replacement value for missing cells
                  <input
                    value={replacement}
                    onChange={event => setReplacement(event.target.value)}
                  />
                </label>

                <button
                  className="primary-button"
                  onClick={applyCleaning}
                  disabled={cleaning || !replacement.trim()}
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

        <footer className="footer">
          <span>DataLens · Data Quality Assessment Platform</span>
          <span>Built for academic purposes</span>
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
