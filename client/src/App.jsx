
import { useMemo, useState } from "react";
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
} from "lucide-react";
import Papa from "papaparse";
import "./App.css";

const sampleData = [
  { id: 1, name: "Customer Records", rows: 1250, issues: 34, score: 97.3, status: "Good" },
  { id: 2, name: "Product Inventory", rows: 840, issues: 126, score: 85.0, status: "Needs review" },
  { id: 3, name: "Sales Transactions", rows: 3200, issues: 18, score: 99.4, status: "Excellent" },
];

function App() {
  const [datasets, setDatasets] = useState(sampleData);
  const [selectedFile, setSelectedFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadError, setUploadError] = useState("");

  const filteredDatasets = useMemo(
    () =>
      datasets.filter((dataset) =>
        dataset.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [datasets, searchTerm]
  );

  const totalRows = datasets.reduce((sum, item) => sum + item.rows, 0);
  const totalIssues = datasets.reduce((sum, item) => sum + item.issues, 0);
  const averageScore = datasets.length
    ? (
        datasets.reduce((sum, item) => sum + item.score, 0) / datasets.length
      ).toFixed(1)
    : "0.0";

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    setUploadError("");
    setSelectedFile(null);
    setCsvData([]);

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Please select a CSV file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size must be 5 MB or less.");
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length || !results.meta.fields?.length) {
          setUploadError("The CSV file appears to be empty or invalid.");
          return;
        }

        setSelectedFile(file);
        setCsvData(results.data);
      },
      error: () => setUploadError("Unable to read this CSV file."),
    });

    event.target.value = "";
  }

  function addDataset() {
    if (!selectedFile || !csvData.length) return;

    const columns = Object.keys(csvData[0]);
    let missingCells = 0;
    const seenRows = new Set();
    let duplicateRows = 0;

    csvData.forEach((row) => {
      columns.forEach((column) => {
        if (row[column] === null || String(row[column]).trim() === "") {
          missingCells += 1;
        }
      });

      const rowKey = JSON.stringify(row);
      if (seenRows.has(rowKey)) duplicateRows += 1;
      seenRows.add(rowKey);
    });

    const issueCount = missingCells + duplicateRows;
    const totalCells = csvData.length * columns.length;
    const score = totalCells
      ? Math.max(0, 100 - (issueCount / totalCells) * 100)
      : 100;

    const newDataset = {
      id: Date.now(),
      name: selectedFile.name.replace(/\.csv$/i, ""),
      rows: csvData.length,
      issues: issueCount,
      score: Number(score.toFixed(1)),
      status: score >= 95 ? "Excellent" : score >= 85 ? "Good" : "Needs review",
    };

    setDatasets((current) => [newDataset, ...current]);
    setSelectedFile(null);
    setCsvData([]);
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
          <a className="nav-item active" href="#dashboard"><LayoutDashboard size={18} /> Dashboard</a>
          <a className="nav-item" href="#datasets"><Database size={18} /> Datasets</a>
          <a className="nav-item" href="#quality"><ShieldCheck size={18} /> Quality checks</a>
          <a className="nav-item" href="#reports"><FileCheck2 size={18} /> Reports</a>
        </nav>

        <div className="sidebar-bottom">
          <a className="nav-item" href="#settings"><Settings size={18} /> Settings</a>
          <a className="nav-item" href="#help"><CircleHelp size={18} /> Help & support</a>
          <div className="profile">
            <div className="avatar">SM</div>
            <div className="profile-info">
              <strong>Workspace user</strong>
              <span>Data analyst</span>
            </div>
            <LogOut size={17} className="logout-icon" />
          </div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="topbar-right">
            <span className="system-status"><span className="status-dot" /> System operational</span>
            <div className="avatar small">SM</div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <p className="eyebrow">DATA QUALITY PLATFORM</p>
            <h1>Dashboard</h1>
            <p className="subtitle">Monitor, assess and improve the quality of your datasets.</p>
          </div>
          <label className="primary-button upload-button">
            <Upload size={17} /> Upload dataset
            <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} hidden />
          </label>
        </section>

        {uploadError && (
          <div className="error-message"><AlertCircle size={17} /> {uploadError}</div>
        )}

        {selectedFile && (
          <section className="upload-preview">
            <div className="upload-file-icon"><FileSpreadsheet size={22} /></div>
            <div className="upload-file-info">
              <strong>{selectedFile.name}</strong>
              <span>{csvData.length.toLocaleString()} rows detected · {Object.keys(csvData[0] || {}).length} columns</span>
            </div>
            <button className="primary-button" onClick={addDataset}>Add dataset</button>
            <button className="icon-button" onClick={() => { setSelectedFile(null); setCsvData([]); }} aria-label="Cancel upload"><X size={18} /></button>
          </section>
        )}

        <section className="metrics-grid">
          <MetricCard title="Total datasets" value={datasets.length} note="Datasets in workspace" icon={<Database />} />
          <MetricCard title="Records analysed" value={totalRows.toLocaleString()} note="Across all datasets" icon={<FileSpreadsheet />} />
          <MetricCard title="Quality issues" value={totalIssues.toLocaleString()} note="Detected by current checks" icon={<AlertCircle />} />
          <MetricCard title="Average quality score" value={`${averageScore}%`} note="Across all datasets" icon={<ShieldCheck />} />
        </section>

        <section className="content-grid">
          <div className="panel datasets-panel" id="datasets">
            <div className="panel-heading">
              <div>
                <h2>Recent datasets</h2>
                <p>Review the quality of your uploaded data.</p>
              </div>
              <button className="text-button">View all <ArrowUpRight size={15} /></button>
            </div>

            <div className="search-box">
              <Search size={17} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
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
                  </tr>
                </thead>
                <tbody>
                  {filteredDatasets.map((dataset) => (
                    <tr key={dataset.id}>
                      <td><div className="dataset-name"><div className="table-file-icon"><FileSpreadsheet size={17} /></div><strong>{dataset.name}</strong></div></td>
                      <td>{dataset.rows.toLocaleString()}</td>
                      <td><span className={dataset.issues ? "issue-count" : "clean-count"}>{dataset.issues}</span></td>
                      <td>
                        <div className="score-cell">
                          <div className="score-track"><div className="score-fill" style={{ width: `${dataset.score}%` }} /></div>
                          <strong>{dataset.score}%</strong>
                        </div>
                      </td>
                      <td><span className={`status-pill ${dataset.status === "Excellent" ? "excellent" : dataset.status === "Good" ? "good" : "review"}`}>{dataset.status}</span></td>
                    </tr>
                  ))}
                  {filteredDatasets.length === 0 && (
                    <tr><td colSpan="5" className="empty-state">No datasets match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="right-column">
            <div className="panel overview-panel" id="quality">
              <div className="panel-heading">
                <div><h2>Quality overview</h2><p>Workspace health at a glance.</p></div>
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
                <div><h2>Quick insights</h2><p>Current workspace summary.</p></div>
              </div>
              <div className="insight-row">
                <div className="insight-icon warning"><AlertCircle size={18} /></div>
                <div><strong>{totalIssues} quality issues</strong><span>Across your datasets</span></div>
              </div>
              <div className="insight-row">
                <div className="insight-icon success"><CheckCircle2 size={18} /></div>
                <div><strong>{datasets.filter((d) => d.score >= 95).length} high-quality datasets</strong><span>Scoring 95% or above</span></div>
              </div>
              <div className="insight-row">
                <div className="insight-icon neutral"><Users size={18} /></div>
                <div><strong>Workspace overview</strong><span>Single-user demo workspace</span></div>
              </div>
            </div>
          </div>
        </section>

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
