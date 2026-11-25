
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Sparkles,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  BarChart3
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const PAGE_SIZE = 10;
const DATASET_PAGE_SIZE = 10;

const EXPECTED_TYPES = [
  "numeric",
  "categorical",
  "boolean",
  "date"
];

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

  // --------------------------------------------------
  // DATASET STATE
  // --------------------------------------------------

  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [cleaningPreview, setCleaningPreview] = useState(null);

  const [datasetPage, setDatasetPage] = useState(1);
  const [datasetTotalPages, setDatasetTotalPages] = useState(1);
  const [datasetTotal, setDatasetTotal] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilterField, setDateFilterField] = useState("uploaded");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datasetSortOrder, setDatasetSortOrder] = useState("recent");

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDataset, setDeletingDataset] = useState(false);

  // --------------------------------------------------
  // VERSION HISTORY
  // --------------------------------------------------

  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);

  // --------------------------------------------------
  // CLEANING STRATEGIES
  // --------------------------------------------------

  const [columnStrategies, setColumnStrategies] = useState({});
  const [invalidStrategies, setInvalidStrategies] = useState({});
  const [outlierStrategies, setOutlierStrategies] = useState({});

  const [cleaning, setCleaning] = useState(false);

  // --------------------------------------------------
  // SECTION VISIBILITY
  // --------------------------------------------------

  const [schemaSectionOpen, setSchemaSectionOpen] = useState(true);
  const [missingSectionOpen, setMissingSectionOpen] = useState(false);
  const [invalidSectionOpen, setInvalidSectionOpen] = useState(false);
  const [outlierSectionOpen, setOutlierSectionOpen] = useState(false);

  // --------------------------------------------------
  // ISSUE EXPLORER
  // --------------------------------------------------

  const [activeIssueType, setActiveIssueType] = useState("invalid");

  const [selectedIssueColumn, setSelectedIssueColumn] = useState({
    missing: "",
    invalid: "",
    outlier: ""
  });

  const [issuePages, setIssuePages] = useState({
    missing: 1,
    invalid: 1,
    outlier: 1
  });

  const [issuePageInputs, setIssuePageInputs] = useState({
    missing: "",
    invalid: "",
    outlier: ""
  });

  const [issueViewAllRows, setIssueViewAllRows] = useState({
    missing: false,
    invalid: false,
    outlier: false
  });

  const [invalidExcludedRows, setInvalidExcludedRows] = useState({});
  const [outlierExcludedRows, setOutlierExcludedRows] = useState({});

  const [missingCellsPage, setMissingCellsPage] = useState(1);
  const MISSING_CELLS_PER_PAGE = 10;

  // --------------------------------------------------
  // SCHEMA VALIDATION
  // --------------------------------------------------

  const [schemaSelections, setSchemaSelections] = useState({});
  const [schemaResults, setSchemaResults] = useState({});
  const [schemaLoading, setSchemaLoading] = useState({});

  // --------------------------------------------------
  // COLUMN MANAGEMENT
  // --------------------------------------------------

  const [columnManagerOpen, setColumnManagerOpen] = useState(false);

  const [newColumn, setNewColumn] = useState({
    name: "",
    type: "fixed",
    value: "",
    start: "1",
    step: "1",
    startDate: "",
    interval: "daily",
    formula: ""
  });

  const [renameDrafts, setRenameDrafts] = useState({});

  // --------------------------------------------------
  // GENERAL UI STATE
  // --------------------------------------------------

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [activityTasks, setActivityTasks] = useState([]);
  const [schemaMismatchPages, setSchemaMismatchPages] = useState({});

  const [currentPage, setCurrentPage] = useState("dashboard");

  const cleaningPanelRef = useRef(null);

  // --------------------------------------------------
  // OPEN DATA EXPLORER
  // --------------------------------------------------

  const [openDataQuery, setOpenDataQuery] = useState("transport");
  const [openDataResults, setOpenDataResults] = useState([]);
  const [openDataTotal, setOpenDataTotal] = useState(0);
  const [openDataLoading, setOpenDataLoading] = useState(false);
  const [openDataError, setOpenDataError] = useState("");

  // --------------------------------------------------
  // NON-BLOCKING TASK ACTIVITY
  // --------------------------------------------------
  function startActivityTask(label) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setActivityTasks(previous => [
      { id, label, progress: 8, status: "running" },
      ...previous
    ].slice(0, 5));
    return id;
  }

  function updateActivityTask(id, progress, label) {
    setActivityTasks(previous => previous.map(task =>
      task.id === id
        ? { ...task, progress: Math.max(task.progress, Math.min(95, progress)), ...(label ? { label } : {}) }
        : task
    ));
  }

  function finishActivityTask(id, success = true, errorLabel = "") {
    setActivityTasks(previous => previous.map(task =>
      task.id === id
        ? { ...task, progress: success ? 100 : task.progress, status: success ? "complete" : "error", errorLabel }
        : task
    ).slice(0, 5));
  }

  // --------------------------------------------------
  // API HELPER
  // --------------------------------------------------

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

    const contentType =
      response.headers.get("content-type") || "";

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

  // --------------------------------------------------
  // LOAD DATASETS WITH SERVER PAGINATION
  // --------------------------------------------------

  async function loadDatasets(page = datasetPage) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(DATASET_PAGE_SIZE),
        dateField: dateFilterField,
        sortOrder: datasetSortOrder
      });

      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const response = await apiRequest(
        `/api/datasets?${params.toString()}`
      );

      const data = await response.json();

      setDatasets(data.datasets || []);

      setDatasetPage(data.pagination?.page || page);
      setDatasetTotalPages(data.pagination?.totalPages || 1);
      setDatasetTotal(data.pagination?.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadDatasets(1);
    }
  }, [
    token,
    dateFilterField,
    dateFrom,
    dateTo,
    datasetSortOrder
  ]);

  useEffect(() => {
    if (selectedDataset && cleaningPanelRef.current) {
      cleaningPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [selectedDataset]);

  // --------------------------------------------------
  // DATASET PAGINATION
  // --------------------------------------------------

  function goToDatasetPage(page) {
    const nextPage = Math.max(
      1,
      Math.min(datasetTotalPages, Number(page) || 1)
    );

    setDatasetPage(nextPage);
    loadDatasets(nextPage);
  }

  const missingCells = cleaningPreview?.missingCells || [];

const missingCellsTotalPages = Math.max(
  1,
  Math.ceil(missingCells.length / MISSING_CELLS_PER_PAGE)
);

const paginatedMissingCells = missingCells.slice(
  (missingCellsPage - 1) * MISSING_CELLS_PER_PAGE,
  missingCellsPage * MISSING_CELLS_PER_PAGE
);

const missingCellsStart = missingCells.length
  ? (missingCellsPage - 1) * MISSING_CELLS_PER_PAGE + 1
  : 0;

const missingCellsEnd = Math.min(
  missingCellsPage * MISSING_CELLS_PER_PAGE,
  missingCells.length
);

  const filteredDatasets = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) return datasets;

    return datasets.filter(dataset =>
      (dataset.name || "").toLowerCase().includes(search)
    );
  }, [datasets, searchTerm]);

  // --------------------------------------------------
  // AUTHENTICATION
  // --------------------------------------------------

  async function handleAuth(event) {
    event.preventDefault();

    setAuthLoading(true);
    setError("");

    try {
      const endpoint =
        authMode === "login"
          ? "/api/auth/login"
          : "/api/auth/register";

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
        throw new Error(
          data.message || "Authentication failed"
        );
      }

      sessionStorage.setItem("datalens_token", data.token);
      sessionStorage.setItem(
        "datalens_user",
        JSON.stringify(data.user)
      );

      setToken(data.token);
      setUser(data.user);

      setAuthForm({
        name: "",
        email: "",
        password: ""
      });

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
    setMissingCellsPage(1);
    setVersions([]);
    setSelectedVersion(null);
    setCurrentPage("dashboard");

    setMessage("");
    setError("");
  }

  // --------------------------------------------------
  // CSV UPLOAD
  // --------------------------------------------------

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
    const taskId = startActivityTask(`Uploading ${file.name}`);

    try {
      const response = await apiRequest(
        "/api/datasets/upload",
        {
          method: "POST",
          body: formData
        }
      );

      updateActivityTask(taskId, 72, "Analysing uploaded dataset");
      const data = await response.json();

      setMessage(
        data.message || "Dataset uploaded successfully."
      );

      setDateFilterField("uploaded");
      setDateFrom("");
      setDateTo("");
      setSearchTerm("");

      await loadDatasets(1);
      finishActivityTask(taskId, true);
    } catch (err) {
      finishActivityTask(taskId, false, err.message);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // --------------------------------------------------
  // OPEN DATASET REVIEW
  // --------------------------------------------------

  async function openCleaningPreview(dataset) {
    setSelectedDataset(dataset);
    setCleaningPreview(null);
    setVersions([]);
    setSelectedVersion(null);

    setSchemaResults({});
    setSchemaSelections({});
    setSchemaLoading({});

    setInvalidExcludedRows({});
    setOutlierExcludedRows({});

    setIssuePages({
      missing: 1,
      invalid: 1,
      outlier: 1
    });

    setIssueViewAllRows({
      missing: false,
      invalid: false,
      outlier: false
    });

    setError("");
    setMessage("");

    try {
      const [
        previewResponse,
        versionsResponse,
        detailResponse
      ] = await Promise.all([
        apiRequest(
          `/api/datasets/${dataset._id}/cleaning-preview`
        ),
        apiRequest(
          `/api/datasets/${dataset._id}/versions`
        ),
        apiRequest(
          `/api/datasets/${dataset._id}`
        )
      ]);

      const previewData = await previewResponse.json();
      const versionsData = await versionsResponse.json();
      const detailData = await detailResponse.json();

      const preview = previewData.preview;

      setSelectedDataset(detailData.dataset || dataset);
      setCleaningPreview(preview);

      const missingColumns = preview.missingColumns || [];
      const schemaColumns = preview.schemaColumns || [];
      const outlierColumns = preview.outlierColumns || [];

      setMissingSectionOpen(missingColumns.length > 0);
      setInvalidSectionOpen(schemaColumns.length > 0);
      setOutlierSectionOpen(outlierColumns.length > 0);

      setSelectedIssueColumn({
        missing: missingColumns[0]?.column || "",
        invalid: schemaColumns[0]?.column || "",
        outlier: outlierColumns[0]?.column || ""
      });

      const initialMissingStrategies = {};

      missingColumns.forEach(item => {
        const available = item.availableStrategies || [];

        const suggestedMethod = available.some(
          option => option.value === item.suggestedMethod
        )
          ? item.suggestedMethod
          : available[0]?.value || "keep";

        initialMissingStrategies[item.column] = {
          method: suggestedMethod,
          value: ""
        };
      });

      setColumnStrategies(initialMissingStrategies);

      const initialInvalidStrategies = {};

      schemaColumns.forEach(item => {
        initialInvalidStrategies[item.column] = {
          method: "keep",
          expectedType: EXPECTED_TYPES.includes(item.inferredType)
            ? item.inferredType
            : "",
          value: ""
        };
      });

      setInvalidStrategies(initialInvalidStrategies);

      const initialOutlierStrategies = {};

      outlierColumns.forEach(item => {
        initialOutlierStrategies[item.column] = {
          method: "keep",
          value: "",
          lowerBound: item.lowerBound ?? null,
          upperBound: item.upperBound ?? null
        };
      });

      setOutlierStrategies(initialOutlierStrategies);

      const sortedVersions = [
        ...(versionsData.versions || [])
      ].sort(
        (a, b) => b.versionNumber - a.versionNumber
      );

      setVersions(sortedVersions);
      setSelectedVersion(sortedVersions[0] || null);
    } catch (err) {
      setError(err.message);
    }
  }

  // --------------------------------------------------
  // REFRESH SELECTED DATASET
  // --------------------------------------------------

  async function refreshSelectedDataset() {
    if (!selectedDataset) return;

    const datasetId = selectedDataset._id;

    const [
      datasetResponse,
      previewResponse,
      versionsResponse
    ] = await Promise.all([
      apiRequest(`/api/datasets/${datasetId}`),
      apiRequest(`/api/datasets/${datasetId}/cleaning-preview`),
      apiRequest(`/api/datasets/${datasetId}/versions`)
    ]);

    const datasetData = await datasetResponse.json();
    const previewData = await previewResponse.json();
    const versionsData = await versionsResponse.json();

    const refreshedDataset = datasetData.dataset;

    setSelectedDataset(refreshedDataset);
    setCleaningPreview(previewData.preview);
    setMissingCellsPage(1);

    const sorted = [
      ...(versionsData.versions || [])
    ].sort(
      (a, b) => b.versionNumber - a.versionNumber
    );

    setVersions(sorted);
    setSelectedVersion(sorted[0] || null);

    setSchemaResults({});
    setSchemaSelections({});

    await loadDatasets(datasetPage);
  }

  // --------------------------------------------------
  // SCHEMA VALIDATION
  // --------------------------------------------------

    // Shared row helpers used by schema, missing-cell and issue tables.
  const datasetColumns = selectedDataset?.columns || [];
  const getRecordForRow = (rowNumber) =>
    selectedDataset?.records?.[Number(rowNumber) - 2] || {};

async function validateSchema(column) {
    if (!selectedDataset) return;

    const profile = selectedDataset.profile?.find(
      item => item.column === column
    );

    const expectedType =
      schemaSelections[column] ||
      (
        EXPECTED_TYPES.includes(profile?.inferredType)
          ? profile.inferredType
          : ""
      );

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
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            column,
            expectedType
          })
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

  // --------------------------------------------------
  // ISSUE PAGINATION HELPERS
  // --------------------------------------------------

  function setIssueColumn(type, column) {
    setSelectedIssueColumn(previous => ({
      ...previous,
      [type]: column
    }));

    setIssuePages(previous => ({
      ...previous,
      [type]: 1
    }));

    setIssuePageInputs(previous => ({
      ...previous,
      [type]: ""
    }));

    setIssueViewAllRows(previous => ({
      ...previous,
      [type]: false
    }));
  }

  function goToIssuePage(type, page, totalPages) {
    const nextPage = Math.max(
      1,
      Math.min(totalPages, Number(page) || 1)
    );

    setIssuePages(previous => ({
      ...previous,
      [type]: nextPage
    }));

    setIssuePageInputs(previous => ({
      ...previous,
      [type]: ""
    }));
  }

  function getPaginatedRows(rows, type) {
    const page = issuePages[type] || 1;
    const totalPages = Math.max(
      1,
      Math.ceil(rows.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, totalPages);

    const start = (safePage - 1) * PAGE_SIZE;

    return {
      rows: rows.slice(start, start + PAGE_SIZE),
      page: safePage,
      totalPages,
      totalRows: rows.length,
      startRow: rows.length ? start + 1 : 0,
      endRow: Math.min(start + PAGE_SIZE, rows.length)
    };
  }

  function renderPagination(type, pagination) {
    const { page, totalPages, totalRows, startRow, endRow } =
      pagination;

    if (totalRows <= PAGE_SIZE) return null;

    const visiblePages = [];

    for (
      let number = Math.max(1, page - 2);
      number <= Math.min(totalPages, page + 2);
      number++
    ) {
      visiblePages.push(number);
    }

    return (
      <div className="issue-pagination">
        <span className="pagination-summary">
          Showing {startRow}–{endRow} of {totalRows}
        </span>

        <div className="pagination-controls">
          <button
            type="button"
            className="pagination-arrow"
            disabled={page === 1}
            onClick={() =>
              goToIssuePage(type, page - 1, totalPages)
            }
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          {visiblePages[0] > 1 && (
            <>
              <button
                type="button"
                className="pagination-number"
                onClick={() => goToIssuePage(type, 1, totalPages)}
              >
                1
              </button>
              {visiblePages[0] > 2 && <span>…</span>}
            </>
          )}

          {visiblePages.map(number => (
            <button
              type="button"
              key={number}
              className={`pagination-number ${
                number === page ? "active" : ""
              }`}
              onClick={() =>
                goToIssuePage(type, number, totalPages)
              }
            >
              {number}
            </button>
          ))}

          {visiblePages[visiblePages.length - 1] < totalPages && (
            <>
              {visiblePages[visiblePages.length - 1] <
                totalPages - 1 && <span>…</span>}
              <button
                type="button"
                className="pagination-number"
                onClick={() =>
                  goToIssuePage(type, totalPages, totalPages)
                }
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            type="button"
            className="pagination-arrow"
            disabled={page === totalPages}
            onClick={() =>
              goToIssuePage(type, page + 1, totalPages)
            }
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <form
          className="pagination-jump"
          onSubmit={event => {
            event.preventDefault();
            goToIssuePage(
              type,
              issuePageInputs[type],
              totalPages
            );
          }}
        >
          <label>
            Go to
            <input
              type="number"
              min="1"
              max={totalPages}
              value={issuePageInputs[type]}
              onChange={event =>
                setIssuePageInputs(previous => ({
                  ...previous,
                  [type]: event.target.value
                }))
              }
              placeholder={String(page)}
            />
          </label>
          <button type="submit" className="secondary-button">
            Go
          </button>
        </form>
      </div>
    );
  }

  // --------------------------------------------------
  // CLEANING ACTION
  // --------------------------------------------------

  async function applyCleaning() {
    if (!selectedDataset) return;

    setCleaning(true);
    setError("");
    setMessage("");
    const taskId = startActivityTask(`Cleaning ${selectedDataset.name}`);

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
              Object.entries(invalidStrategies).map(
                ([column, strategy]) => [
                  column,
                  {
                    ...strategy,
                    excludedRows:
                      invalidExcludedRows[column] || []
                  }
                ]
              )
            ),

            outlierStrategies: Object.fromEntries(
              Object.entries(outlierStrategies).map(
                ([column, strategy]) => [
                  column,
                  {
                    ...strategy,
                    excludedRows:
                      outlierExcludedRows[column] || []
                  }
                ]
              )
            ),

            removeDuplicates: true
          })
        }
      );

      updateActivityTask(taskId, 70, "Refreshing quality profile and version history");
      const data = await response.json();

      setMessage(
        `Cleaning complete. Version ${data.version.versionNumber} created.`
      );

      await refreshSelectedDataset();
      finishActivityTask(taskId, true);
    } catch (err) {
      finishActivityTask(taskId, false, err.message);
      setError(err.message);
    } finally {
      setCleaning(false);
    }
  }

  // --------------------------------------------------
  // DATASET DELETION
  // --------------------------------------------------

  async function deleteSelectedDataset(
    dataset = selectedDataset
  ) {
    if (!dataset) return;

    const confirmed = window.confirm(
      `Delete "${dataset.name}" and all its version history? This cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingDataset(true);
    setError("");

    try {
      await apiRequest(
        `/api/datasets/${dataset._id}`,
        { method: "DELETE" }
      );

      if (selectedDataset?._id === dataset._id) {
        setSelectedDataset(null);
        setCleaningPreview(null);
        setVersions([]);
        setSelectedVersion(null);
      }

      setMessage(
        `"${dataset.name}" and its version history were deleted.`
      );

      await loadDatasets(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingDataset(false);
    }
  }

  // --------------------------------------------------
  // COLUMN MANAGEMENT
  // --------------------------------------------------

  async function runColumnOperation(
    path,
    body,
    successMessage
  ) {
    if (!selectedDataset) return;

    setError("");
    setMessage("");
    const taskId = startActivityTask(successMessage.replace(/\.$/, ""));

    try {
      const response = await apiRequest(
        `/api/datasets/${selectedDataset._id}/columns/${path}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      );

      const data = await response.json();

      setMessage(
        `${successMessage} New version ${data.versionNumber} created.`
      );

      updateActivityTask(taskId, 75, "Refreshing dataset and version history");
      await refreshSelectedDataset();
      finishActivityTask(taskId, true);
    } catch (err) {
      finishActivityTask(taskId, false, err.message);
      setError(err.message);
    }
  }

  async function addSchemaColumn(event) {
    event.preventDefault();

    await runColumnOperation(
      "add",
      {
        ...newColumn,
        name: newColumn.name.trim()
      },
      "Column added."
    );

    setNewColumn({
      name: "",
      type: "fixed",
      value: "",
      start: "1",
      step: "1",
      startDate: "",
      interval: "daily",
      formula: ""
    });
  }

  async function renameSchemaColumn(oldName) {
    const newName = (
      renameDrafts[oldName] || oldName
    ).trim();

    if (!newName || newName === oldName) return;

    await runColumnOperation(
      "rename",
      { oldName, newName },
      "Column renamed."
    );
  }

  async function removeSchemaColumn(column) {
    const confirmed = window.confirm(
      `Remove "${column}" from the active dataset? Its values will be archived and can be restored.`
    );

    if (!confirmed) return;

    await runColumnOperation(
      "remove",
      { column },
      "Column removed."
    );
  }

  async function restoreSchemaColumn(column) {
    await runColumnOperation(
      "restore",
      { column },
      "Column restored."
    );
  }

  // --------------------------------------------------
  // CSV EXPORT
  // --------------------------------------------------

  async function exportDataset(dataset, version) {
    const taskId = startActivityTask(`Preparing ${version ? `version ${version}` : "current dataset"} download`);
    try {
      setError("");

      const query = version
        ? `?version=${version}`
        : "";

      const response = await apiRequest(
        `/api/datasets/${dataset._id}/export${query}`
      );

      updateActivityTask(taskId, 78, "Preparing CSV file");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;

      link.download = version
        ? `${dataset.name}-version-${version}.csv`
        : `${dataset.name}-current.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);

      setMessage("CSV download started.");
      finishActivityTask(taskId, true);
    } catch (err) {
      finishActivityTask(taskId, false, err.message);
      setError(err.message);
    }
  }

  // --------------------------------------------------
  // OPEN DATA SEARCH
  // --------------------------------------------------

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
        `/api/open-data/search?q=${encodeURIComponent(
          openDataQuery
        )}&rows=8`
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

  // --------------------------------------------------
  // DASHBOARD METRICS
  // --------------------------------------------------

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
          (sum, item) =>
            sum + (item.qualityScore || 0),
          0
        ) / datasets.length
      ).toFixed(1)
    : "0.0";

  const highQualityCount = datasets.filter(
    dataset => dataset.qualityScore >= 95
  ).length;

  const savedMetrics =
    selectedDataset?.qualityMetrics || {};

  const datasetMetrics = {
    completeness:
      typeof savedMetrics.completeness === "number"
        ? savedMetrics.completeness
        : null,

    uniqueness:
      typeof savedMetrics.uniqueness === "number"
        ? savedMetrics.uniqueness
        : null,

    schemaValidity:
      typeof savedMetrics.schemaCompliance === "number"
        ? savedMetrics.schemaCompliance
        : null
  };

  const assessedDimensions = [
    datasetMetrics.completeness,
    datasetMetrics.uniqueness,
    datasetMetrics.schemaValidity
  ].filter(value => typeof value === "number" && Number.isFinite(value));

  const consistentDatasetScore = assessedDimensions.length
    ? assessedDimensions.reduce((sum, value) => sum + value, 0) / assessedDimensions.length
    : selectedDataset?.qualityScore ?? null;

  function getStatus(score) {
    if (score >= 95) return "Excellent";
    if (score >= 85) return "Good";
    return "Needs review";
  }

  
  // --------------------------------------------------
  // AUTHENTICATION SCREEN
  // --------------------------------------------------

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand auth-brand">
            <div className="brand-icon datalens-brand-icon">
              <Database size={26} className="brand-database-mark" />
              <Search size={14} className="brand-lens-mark" />
            </div>
            <span>
              Data<span className="brand-light">Lens</span>
            </span>
          </div>

          <p className="eyebrow">DATA QUALITY PLATFORM</p>

          <h1>
            {authMode === "login"
              ? "Welcome back"
              : "Create your account"}
          </h1>

          <p className="subtitle">
            {authMode === "login"
              ? "Sign in to profile, analyse and improve your data quality."
              : "Create your workspace and start building better-quality datasets."}
          </p>

          {error && (
            <div className="error-message">
              <AlertCircle size={17} />
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} className="auth-form">
            {authMode === "register" && (
              <label>
                Full name
                <input
                  required
                  minLength={2}
                  value={authForm.name}
                  onChange={event =>
                    setAuthForm({
                      ...authForm,
                      name: event.target.value
                    })
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
                onChange={event =>
                  setAuthForm({
                    ...authForm,
                    email: event.target.value
                  })
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
                onChange={event =>
                  setAuthForm({
                    ...authForm,
                    password: event.target.value
                  })
                }
                placeholder="At least 8 characters"
              />
            </label>

            <button
              className="primary-button auth-submit"
              disabled={authLoading}
            >
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
                setAuthMode(
                  authMode === "login" ? "register" : "login"
                );
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

  // --------------------------------------------------
  // MAIN APPLICATION
  // --------------------------------------------------

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon datalens-brand-icon">
            <Database size={26} className="brand-database-mark" />
            <Search size={14} className="brand-lens-mark" />
          </div>

          <span>
            Data<span className="brand-light">Lens</span>
          </span>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          <a className="nav-item active" href="#dashboard">
            <LayoutDashboard size={18} />
            Dashboard
          </a>

          <a className="nav-item" href="#datasets">
            <Database size={18} />
            Datasets
          </a>

          <a className="nav-item" href="#quality">
            <ShieldCheck size={18} />
            Quality checks
          </a>

          <a className="nav-item" href="#reports">
            <FileCheck2 size={18} />
            Reports
          </a>

          <a className="nav-item" href="#open-data">
            <Database size={18} />
            Open Data Explorer
          </a>
        </nav>

        <div className="sidebar-bottom">
          <a className="nav-item" href="#settings">
            <Settings size={18} />
            Settings
          </a>

          <a className="nav-item" href="#help">
            <CircleHelp size={18} />
            Help & support
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
          <div className="breadcrumb">
            Workspace <span>/</span> Overview
          </div>

          <div className="topbar-right">
            <span className="system-status">
              <span className="status-dot" />
              API connected
            </span>

            <div className="avatar small">
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        {/* PAGE HEADING */}

        <section className="page-heading">
          <div>
            <p className="eyebrow">
              DATA QUALITY & INTELLIGENCE
            </p>

            <h1>Data Quality Command Center</h1>

            <p className="subtitle">
              Profile, monitor, clean and prepare your data for
              reliable analytics and machine learning.
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

        {/* NOTIFICATIONS */}

        {error && (
          <div className="error-message">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        {message && (
          <div className="success-message">
            <CheckCircle2 size={17} />
            {message}

            <button
              onClick={() => setMessage("")}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* DASHBOARD METRICS */}

        <section className="metrics-grid">
          <MetricCard
            title="Total datasets"
            value={datasetTotal.toLocaleString()}
            note="Your uploaded datasets"
            icon={<Database />}
          />

          <MetricCard
            title="Records analysed"
            value={totalRows.toLocaleString()}
            note="Across the loaded datasets"
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
            note="Average across the loaded datasets"
            icon={<ShieldCheck />}
          />
        </section>

        {/* MAIN DASHBOARD GRID */}

        <section className="content-grid">
          <div
            className="panel datasets-panel"
            id="datasets"
          >
            <div className="panel-heading">
              <div>
                <h2>Recent datasets</h2>
                <p>
                  Review the quality of your uploaded data.
                </p>
              </div>

              <button
                className="text-button"
                onClick={() => loadDatasets(datasetPage)}
                disabled={loading}
              >
                Refresh <RefreshCw size={15} />
              </button>
            </div>

            {/* DATASET SEARCH */}

            <div className="search-box">
              <Search size={17} />

              <input
                value={searchTerm}
                onChange={event =>
                  setSearchTerm(event.target.value)
                }
                placeholder="Search datasets..."
              />
            </div>

            {/* DATE FILTERS */}

            <div className="dataset-filters">
              <label>
                Date field
                <select
                  value={dateFilterField}
                  onChange={event =>
                    setDateFilterField(event.target.value)
                  }
                >
                  <option value="uploaded">
                    Upload date
                  </option>
                  <option value="analysed">
                    Last analysed
                  </option>
                </select>
              </label>

              <label>
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={event =>
                    setDateFrom(event.target.value)
                  }
                />
              </label>

              <label>
                To
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={event =>
                    setDateTo(event.target.value)
                  }
                />
              </label>

              <label>
                Sort
                <select
                  value={datasetSortOrder}
                  onChange={event =>
                    setDatasetSortOrder(event.target.value)
                  }
                >
                  <option value="recent">
                    Newest first
                  </option>
                  <option value="oldest">
                    Oldest first
                  </option>
                </select>
              </label>

              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear dates
                </button>
              )}
            </div>

            {/* DATASET TABLE */}

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
                      <td
                        colSpan="6"
                        className="empty-state"
                      >
                        Loading datasets...
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filteredDatasets.map(dataset => {
                      const issues =
                        (dataset.issueSummary?.missingValues || 0) +
                        (dataset.issueSummary?.duplicateRows || 0) +
                        (dataset.issueSummary?.invalidValues || 0);

                      const score =
                        Number(dataset.qualityScore) || 0;

                      const status = getStatus(score);

                      return (
                        <tr key={dataset._id}>
                          <td>
                            <div className="dataset-name">
                              <div className="table-file-icon">
                                <FileSpreadsheet size={17} />
                              </div>

                              <div>
                                <strong>{dataset.name}</strong>

                                <span className="dataset-date">
                                  {dataset.createdAt
                                    ? new Date(
                                        dataset.createdAt
                                      ).toLocaleDateString()
                                    : "Date unavailable"}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            {(dataset.rowCount || 0).toLocaleString()}
                          </td>

                          <td>
                            <span
                              className={
                                issues
                                  ? "issue-count"
                                  : "clean-count"
                              }
                            >
                              {issues}
                            </span>
                          </td>

                          <td>
                            <div className="score-cell">
                              <div className="score-track">
                                <div
                                  className="score-fill"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(0, score)
                                    )}%`
                                  }}
                                />
                              </div>

                              <strong>
                                {score.toFixed(1)}%
                              </strong>
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
                                onClick={() =>
                                  openCleaningPreview(dataset)
                                }
                              >
                                Review
                              </button>

                              <button
                                className="text-button danger-text"
                                onClick={() =>
                                  deleteSelectedDataset(dataset)
                                }
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

                  {!loading &&
                    filteredDatasets.length === 0 && (
                      <tr>
                        <td
                          colSpan="6"
                          className="empty-state"
                        >
                          No datasets found. Upload a CSV to get
                          started.
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>

            {/* DATASET PAGINATION */}

            {datasetTotalPages > 1 && (
              <div className="dataset-pagination">
                <span>
                  Page {datasetPage} of {datasetTotalPages}
                  {" · "}
                  {datasetTotal.toLocaleString()} datasets
                </span>

                <div className="pagination-controls">
                  <button
                    type="button"
                    className="pagination-arrow"
                    disabled={datasetPage <= 1 || loading}
                    onClick={() =>
                      goToDatasetPage(datasetPage - 1)
                    }
                    aria-label="Previous dataset page"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {Array.from(
                    { length: datasetTotalPages },
                    (_, index) => index + 1
                  )
                    .filter(page =>
                      Math.abs(page - datasetPage) <= 2 ||
                      page === 1 ||
                      page === datasetTotalPages
                    )
                    .map((page, index, visible) => (
                      <React.Fragment key={page}>
                        {index > 0 &&
                          page - visible[index - 1] > 1 && (
                            <span>…</span>
                          )}

                        <button
                          type="button"
                          className={`pagination-number ${
                            page === datasetPage ? "active" : ""
                          }`}
                          onClick={() =>
                            goToDatasetPage(page)
                          }
                          disabled={loading}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    ))}

                  <button
                    type="button"
                    className="pagination-arrow"
                    disabled={
                      datasetPage >= datasetTotalPages ||
                      loading
                    }
                    onClick={() =>
                      goToDatasetPage(datasetPage + 1)
                    }
                    aria-label="Next dataset page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT-SIDE QUALITY OVERVIEW */}

          <div className="right-column">
            <div className="panel overview-panel" id="quality">
              <div className="panel-heading">
                <div>
                  <h2>Quality overview</h2>
                  <p>Workspace health at a glance.</p>
                </div>
                <ChevronDown size={17} className="muted-icon" />
              </div>

              <div
                className="quality-ring"
                style={{ "--score": `${averageScore}%` }}
              >
                <div className="ring-inner">
                  <strong>{averageScore}%</strong>
                  <span>Average score</span>
                </div>
              </div>

              <div className="overview-footer">
                <span>
                  <span className="legend-dot" />
                  Overall dataset quality
                </span>
                <strong>{datasetTotal} datasets</strong>
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
                  <span>Across the loaded datasets</span>
                </div>
              </div>

              <div className="insight-row">
                <div className="insight-icon success">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <strong>
                    {highQualityCount} high-quality datasets
                  </strong>
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

        {/* DATASET REVIEW */}

        {selectedDataset && (
          <section
            ref={cleaningPanelRef}
            className="panel cleaning-panel"
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">DATASET REVIEW</p>
                <h2>{selectedDataset.name}</h2>
                <p>
                  Review quality indicators, inspect detected issues
                  and apply cleaning.
                </p>
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

            {/* EXPORT ACTIONS */}

            <div className="export-actions">
              <button
                className="secondary-button"
                onClick={() => exportDataset(selectedDataset)}
              >
                <Download size={16} />
                Download current dataset
              </button>

              {versions
                .filter(version => version.versionNumber > 1)
                .map(version => (
                  <button
                    key={version.versionNumber}
                    className="secondary-button"
                    onClick={() =>
                      exportDataset(
                        selectedDataset,
                        version.versionNumber
                      )
                    }
                  >
                    <Download size={16} />
                    Download V{version.versionNumber}
                  </button>
                ))}
            </div>

            {/* CURRENT DATASET HEALTH */}

            <div className="dataset-health-section">
              <div className="dataset-health-heading">
                <div>
                  <p className="eyebrow">DATASET HEALTH</p>
                  <h3>Current quality assessment</h3>
                  <p>
                    Measured quality indicators for this dataset.
                  </p>
                </div>

                <div className="dataset-health-score">
                  <strong>
                    {consistentDatasetScore == null
                      ? "Not assessed"
                      : `${consistentDatasetScore.toFixed(2)}%`}
                  </strong>
                  <span>Overall quality</span>
                </div>
              </div>

              <div className="dataset-health-grid">
                <div className="dataset-health-card">
                  <span>Completeness</span>
                  <strong>
                    {datasetMetrics.completeness == null
                      ? "Not assessed"
                      : `${datasetMetrics.completeness.toFixed(2)}%`}
                  </strong>
                  <div className="health-track">
                    <div
                      style={{
                        width: `${datasetMetrics.completeness ?? 0}%`
                      }}
                    />
                  </div>
                </div>

                <div className="dataset-health-card">
                  <span>Uniqueness</span>
                  <strong>
                    {datasetMetrics.uniqueness == null
                      ? "Not assessed"
                      : `${datasetMetrics.uniqueness.toFixed(2)}%`}
                  </strong>
                  <div className="health-track">
                    <div
                      style={{
                        width: `${datasetMetrics.uniqueness ?? 0}%`
                      }}
                    />
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
                    <div
                      style={{
                        width: `${datasetMetrics.schemaValidity ?? 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="dataset-health-grid readiness-grid">
                <div className="dataset-health-card">
                  <span>ML readiness estimate</span>
                  <strong>
                    {typeof selectedDataset.mlReadiness?.score === "number"
                      ? `${selectedDataset.mlReadiness.score.toFixed(2)}%`
                      : "Not assessed"}
                  </strong>
                </div>

                <div className="dataset-health-card">
                  <span>Potential readiness</span>
                  <strong>
                    {typeof selectedDataset.mlReadiness?.potentialScore === "number"
                      ? `${selectedDataset.mlReadiness.potentialScore.toFixed(2)}%`
                      : "Not assessed"}
                  </strong>
                </div>

                <div className="dataset-health-card">
                  <span>Improvement opportunity</span>
                  <strong>
                    {typeof selectedDataset.mlReadiness?.improvementOpportunity === "number"
                      ? `${selectedDataset.mlReadiness.improvementOpportunity.toFixed(2)}%`
                      : "Not assessed"}
                  </strong>
                </div>
              </div>

              <p className="muted-copy">
                ML readiness is an estimate based on dataset quality
                indicators. It does not represent a trained or evaluated
                machine learning model.
              </p>
            </div>

            {/* VERSION HISTORY */}

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
                    {[...versions]
                      .sort(
                        (a, b) =>
                          b.versionNumber - a.versionNumber
                      )
                      .map(version => (
                        <tr
                          key={version.versionNumber}
                          onClick={() => setSelectedVersion(version)}
                          className={`version-clickable-row ${
                            selectedVersion?.versionNumber ===
                            version.versionNumber
                              ? "selected-version-row"
                              : ""
                          }`}
                        >
                          <td>
                            <strong>{version.label}</strong>

                            {version.versionNumber === 1 && (
                              <span className="status-pill good">
                                Original
                              </span>
                            )}
                          </td>

                          <td>{version.rowCount ?? "—"}</td>

                          <td>
                            <strong>
                              {version.qualityScore == null
                                ? "Not assessed"
                                : `${Number(
                                    version.qualityScore
                                  ).toFixed(2)}%`}
                            </strong>
                          </td>

                          <td>
                            {version.changeSummary?.missingValuesFilled || 0}
                          </td>

                          <td>
                            {version.changeSummary?.duplicateRowsRemoved || 0}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* SELECTED VERSION DETAILS */}

              {selectedVersion && (
                <div className="version-details">
                  <div className="panel-heading">
                    <div>
                      <h3>
                        {selectedVersion.label ||
                          `Version ${selectedVersion.versionNumber}`}
                      </h3>
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
                    <div className="dataset-health-card">
                      <span>Version</span>
                      <strong>V{selectedVersion.versionNumber}</strong>
                    </div>

                    <div className="dataset-health-card">
                      <span>Rows</span>
                      <strong>
                        {selectedVersion.rowCount ?? "—"}
                      </strong>
                    </div>

                    <div className="dataset-health-card">
                      <span>Quality score</span>
                      <strong>
                        {selectedVersion.qualityScore == null
                          ? "Not assessed"
                          : `${Number(
                              selectedVersion.qualityScore
                            ).toFixed(2)}%`}
                      </strong>
                    </div>

                    <div className="dataset-health-card">
                      <span>Missing values filled</span>
                      <strong>
                        {selectedVersion.changeSummary?.missingValuesFilled ?? 0}
                      </strong>
                    </div>

                    <div className="dataset-health-card">
                      <span>Duplicates removed</span>
                      <strong>
                        {selectedVersion.changeSummary?.duplicateRowsRemoved ?? 0}
                      </strong>
                    </div>

                    <div className="dataset-health-card">
                      <span>Created</span>
                      <strong>
                        {selectedVersion.createdAt
                          ? new Date(
                              selectedVersion.createdAt
                            ).toLocaleString()
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  <h4 className="version-metrics-heading">
                    Quality dimensions for this version
                  </h4>

                  <div className="dataset-health-grid version-metric-grid">
                    {[
                      {
                        label: "Completeness",
                        value: selectedVersion.qualityMetrics?.completeness
                      },
                      {
                        label: "Uniqueness",
                        value: selectedVersion.qualityMetrics?.uniqueness
                      },
                      {
                        label: "Schema validity",
                        value: selectedVersion.qualityMetrics?.schemaCompliance
                      }
                    ].map(metric => (
                      <div
                        className="dataset-health-card"
                        key={metric.label}
                      >
                        <span>{metric.label}</span>

                        <strong>
                          {typeof metric.value === "number"
                            ? `${metric.value.toFixed(2)}%`
                            : "Not assessed"}
                        </strong>

                        <div className="health-track">
                          <div
                            style={{
                              width: `${
                                typeof metric.value === "number"
                                  ? Math.min(
                                      100,
                                      Math.max(0, metric.value)
                                    )
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CLEANING PREVIEW */}

            {cleaningPreview ? (
              <>
                <div className="preview-stats">
                  <div>
                    <span>Rows</span>
                    <strong>
                      {cleaningPreview.totalRows ?? 0}
                    </strong>
                  </div>

                  <div>
                    <span>Missing values</span>
                    <strong>
                      {cleaningPreview.missingValuesFound ?? 0}
                    </strong>
                  </div>

                  <div>
                    <span>Exact duplicate rows</span>
                    <strong>
                      {cleaningPreview.duplicateRowsFound ?? 0}
                    </strong>
                  </div>
                </div>

                {/* SCHEMA VALIDATION */}

                <div className="schema-validation-section">
                  <button
                    className="section-toggle"
                    type="button"
                    onClick={() =>
                      setSchemaSectionOpen(value => !value)
                    }
                    aria-expanded={schemaSectionOpen}
                  >
                    <span>
                      <h3>Schema Validation</h3>
                      <small>
                        {(selectedDataset.profile || []).length} columns
                        in dataset
                      </small>
                    </span>

                    <ChevronDown
                      className={
                        schemaSectionOpen
                          ? "section-chevron open"
                          : "section-chevron"
                      }
                      size={18}
                    />
                  </button>

                  {schemaSectionOpen && (
                    <>
                      <p>
                        Review automatically inferred data types or
                        select an expected type manually to identify
                        inconsistent values.
                      </p>

                      {/* COLUMN MANAGEMENT */}

                      <div className="schema-manager">
                        <div className="schema-manager-heading">
                          <div>
                            <h3>Column management</h3>
                            <p>
                              Add, rename, remove or restore columns.
                              Every change creates a new dataset version.
                            </p>
                          </div>

                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              setColumnManagerOpen(value => !value)
                            }
                          >
                            {columnManagerOpen
                              ? "Hide tools"
                              : "Manage columns"}
                          </button>
                        </div>

                        {columnManagerOpen && (
                          <>
                            <form
                              className="schema-add-form"
                              onSubmit={addSchemaColumn}
                            >
                              <label>
                                New column name
                                <input
                                  required
                                  maxLength="150"
                                  value={newColumn.name}
                                  onChange={event =>
                                    setNewColumn(previous => ({
                                      ...previous,
                                      name: event.target.value
                                    }))
                                  }
                                  placeholder="e.g. Region"
                                />
                              </label>

                              <label>
                                Creation method
                                <select
                                  value={newColumn.type}
                                  onChange={event =>
                                    setNewColumn(previous => ({
                                      ...previous,
                                      type: event.target.value
                                    }))
                                  }
                                >
                                  <option value="fixed">
                                    Same value for all rows
                                  </option>
                                  <option value="increment">
                                    Numeric sequence
                                  </option>
                                  <option value="date_sequence">
                                    Date sequence
                                  </option>
                                  <option value="formula">
                                    Formula
                                  </option>
                                </select>
                              </label>

                              {newColumn.type === "fixed" && (
                                <label>
                                  Value
                                  <input
                                    value={newColumn.value}
                                    onChange={event =>
                                      setNewColumn(previous => ({
                                        ...previous,
                                        value: event.target.value
                                      }))
                                    }
                                  />
                                </label>
                              )}

                              {newColumn.type === "increment" && (
                                <>
                                  <label>
                                    Start
                                    <input
                                      type="number"
                                      value={newColumn.start}
                                      onChange={event =>
                                        setNewColumn(previous => ({
                                          ...previous,
                                          start: event.target.value
                                        }))
                                      }
                                    />
                                  </label>

                                  <label>
                                    Step
                                    <input
                                      type="number"
                                      value={newColumn.step}
                                      onChange={event =>
                                        setNewColumn(previous => ({
                                          ...previous,
                                          step: event.target.value
                                        }))
                                      }
                                    />
                                  </label>
                                </>
                              )}

                              {newColumn.type === "date_sequence" && (
                                <>
                                  <label>
                                    Start date
                                    <input
                                      type="date"
                                      required
                                      value={newColumn.startDate}
                                      onChange={event =>
                                        setNewColumn(previous => ({
                                          ...previous,
                                          startDate: event.target.value
                                        }))
                                      }
                                    />
                                  </label>

                                  <label>
                                    Interval
                                    <select
                                      value={newColumn.interval}
                                      onChange={event =>
                                        setNewColumn(previous => ({
                                          ...previous,
                                          interval: event.target.value
                                        }))
                                      }
                                    >
                                      <option value="daily">Daily</option>
                                      <option value="monthly">Monthly</option>
                                      <option value="yearly">Yearly</option>
                                    </select>
                                  </label>
                                </>
                              )}

                              {newColumn.type === "formula" && (
                                <label className="schema-formula-field">
                                  Formula
                                  <input
                                    required
                                    value={newColumn.formula}
                                    onChange={event =>
                                      setNewColumn(previous => ({
                                        ...previous,
                                        formula: event.target.value
                                      }))
                                    }
                                    placeholder="e.g. Age * 2 + 5"
                                  />
                                  <small>
                                    Use numeric column names, numbers
                                    and + − × ÷ parentheses.
                                  </small>
                                </label>
                              )}

                              <button
                                className="primary-button"
                                type="submit"
                              >
                                Add column
                              </button>
                            </form>

                            <div className="schema-column-management-list">
                              {(selectedDataset.columns || []).map(
                                column => (
                                  <div
                                    className="schema-column-management-row"
                                    key={column}
                                  >
                                    <strong>{column}</strong>

                                    <input
                                      aria-label={`Rename ${column}`}
                                      value={
                                        renameDrafts[column] ?? column
                                      }
                                      onChange={event =>
                                        setRenameDrafts(previous => ({
                                          ...previous,
                                          [column]: event.target.value
                                        }))
                                      }
                                    />

                                    <button
                                      className="secondary-button"
                                      type="button"
                                      onClick={() =>
                                        renameSchemaColumn(column)
                                      }
                                    >
                                      Rename
                                    </button>

                                    <button
                                      className="text-button danger-text"
                                      type="button"
                                      onClick={() =>
                                        removeSchemaColumn(column)
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )
                              )}

                              {(selectedDataset.archivedColumns || [])
                                .length > 0 && (
                                <div className="archived-columns">
                                  <strong>Archived columns</strong>

                                  {(selectedDataset.archivedColumns || [])
                                    .map(item => (
                                      <div
                                        className="schema-column-management-row"
                                        key={item.name}
                                      >
                                        <span>{item.name}</span>
                                        <span className="muted-copy">
                                          Archived
                                        </span>

                                        <button
                                          className="secondary-button"
                                          type="button"
                                          onClick={() =>
                                            restoreSchemaColumn(item.name)
                                          }
                                        >
                                          Restore
                                        </button>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* COLUMN TYPE VALIDATION */}

                      <div className="schema-validation-list">
                        {(selectedDataset.profile || []).map(profile => {
                          const column = profile.column;
                          const inferredType = profile.inferredType;

                          const currentType =
                            schemaSelections[column] ??
                            (
                              EXPECTED_TYPES.includes(inferredType)
                                ? inferredType
                                : ""
                            );

                          const result = schemaResults[column];
                          const isLoading = schemaLoading[column];

                          return (
                            <div
                              className="schema-validation-card"
                              key={column}
                            >
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
                                    <option value="">
                                      Select expected type
                                    </option>
                                    <option value="numeric">
                                      Numeric
                                    </option>
                                    <option value="categorical">
                                      Text / Categorical
                                    </option>
                                    <option value="boolean">
                                      Boolean
                                    </option>
                                    <option value="date">
                                      Date
                                    </option>
                                  </select>
                                </label>

                                <button
                                  className="secondary-button"
                                  disabled={!currentType || isLoading}
                                  onClick={() => validateSchema(column)}
                                >
                                  {isLoading
                                    ? "Validating..."
                                    : "Validate column"}
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
                                      <strong>
                                        {result.mismatchPercentage}%
                                      </strong>
                                    </div>
                                  </div>

                                  <div
                                    className={`schema-result-status ${
                                      result.status === "valid"
                                        ? "valid"
                                        : "invalid"
                                    }`}
                                  >
                                    {result.status === "valid"
                                      ? "All non-missing values match the selected type."
                                      : result.status === "empty"
                                        ? "No non-missing values available to validate."
                                        : "Schema mismatch detected. Review the invalid values below."}
                                  </div>

                                  {result.mismatches?.length > 0 && (() => {
                                    const page = schemaMismatchPages[column] || 1;
                                    const pageSize = 10;
                                    const totalPages = Math.max(1, Math.ceil(result.mismatches.length / pageSize));
                                    const start = (page - 1) * pageSize;
                                    const pageItems = result.mismatches.slice(start, start + pageSize);
                                    const rowColumns = selectedDataset.columns || [];
                                    return (
                                      <div className="schema-mismatch-review">
                                        <div className="schema-mismatch-heading">
                                          <div><strong>Rows with schema mismatches</strong><span>Showing {start + 1}–{Math.min(start + pageSize, result.mismatches.length)} of {result.mismatches.length}</span></div>
                                          <span className="schema-page-size">10 rows per page</span>
                                        </div>
                                        <div className="table-wrap schema-full-row-table">
                                          <table>
                                            <thead><tr><th>DATA ROW</th><th>INVALID VALUE</th><th>DETECTED TYPE</th><th>EXPECTED TYPE</th>{rowColumns.map(name => <th key={name}>{name}</th>)}</tr></thead>
                                            <tbody>{pageItems.map((item, index) => {
                                              const fullRecord = getRecordForRow(item.row);
                                              return <tr key={`${item.row}-${index}`}>
                                                <td><strong>{item.row}</strong></td>
                                                <td className="schema-invalid-value">{String(item.value ?? "")}</td>
                                                <td>{item.detectedType || "Unknown"}</td>
                                                <td>{item.expectedType || currentType}</td>
                                                {rowColumns.map(name => <td key={name}>{String(fullRecord?.[name] ?? "—")}</td>)}
                                              </tr>;
                                            })}</tbody>
                                          </table>
                                        </div>
                                        {totalPages > 1 && <div className="schema-mismatch-pagination">
                                          <span>Page {page} of {totalPages}</span>
                                          <div>
                                            <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setSchemaMismatchPages(p => ({...p, [column]: Math.max(1, page - 1)}))}>Previous</button>
                                            <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => setSchemaMismatchPages(p => ({...p, [column]: Math.min(totalPages, page + 1)}))}>Next</button>
                                          </div>
                                        </div>}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* MISSING CELLS OVERVIEW */}

                <div className="missing-cells-overview">
                  

<h3>Detected missing cells</h3>

{missingCells.length > 0 ? (
  <>
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ROW</th>
            <th>MISSING COLUMN</th>
            {datasetColumns.map(column => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedMissingCells.map((cell, index) => {
            const record = getRecordForRow(cell.row);

            return (
              <tr key={`${cell.row}-${cell.column}-${index}`}>
                <td>{cell.row}</td>
                <td><strong>{cell.column}</strong></td>
                {datasetColumns.map(column => (
                  <td
                    key={column}
                    className={
                      column === cell.column
                        ? "missing-cell-highlight"
                        : ""
                    }
                  >
                    {column === cell.column
                      ? "Missing"
                      : String(record[column] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="pagination-controls">
      <span>
        Showing {missingCellsStart}–{missingCellsEnd} of{" "}
        {missingCells.length} missing cells
      </span>
      <div className="pagination-buttons">
        <button
          type="button"
          className="secondary-button"
          disabled={missingCellsPage <= 1}
          onClick={() =>
            setMissingCellsPage(page => Math.max(1, page - 1))
          }
        >
          Previous
        </button>
        <span>
          Page {missingCellsPage} of {missingCellsTotalPages}
        </span>
        <button
          type="button"
          className="secondary-button"
          disabled={missingCellsPage >= missingCellsTotalPages}
          onClick={() =>
            setMissingCellsPage(page =>
              Math.min(missingCellsTotalPages, page + 1)
            )
          }
        >
          Next
        </button>
      </div>
    </div>
  </>
) : (
  <p>No missing cells detected.</p>
)}


                </div>

                {/* MISSING VALUE TREATMENT */}

                <div className="column-cleaning-section">
                  <button
                    className="section-toggle"
                    type="button"
                    onClick={() =>
                      setMissingSectionOpen(value => !value)
                    }
                    aria-expanded={missingSectionOpen}
                  >
                    <span>
                      <h3>Missing Value Cleaning</h3>
                      <small>
                        {cleaningPreview.missingValuesFound || 0} missing
                        cells detected
                      </small>
                    </span>

                    <ChevronDown
                      className={
                        missingSectionOpen
                          ? "section-chevron open"
                          : "section-chevron"
                      }
                      size={18}
                    />
                  </button>

                  {missingSectionOpen && (
                    <>
                      <p>
                        Select how DataLens should handle missing values
                        in each column. You can choose a different method
                        for every column.
                      </p>

                      {cleaningPreview.missingColumns?.length ? (
                        cleaningPreview.missingColumns.map(item => {
                          const selected =
                            columnStrategies[item.column] || {
                              method: item.suggestedMethod || "keep",
                              value: ""
                            };

                          return (
                            <div
                              className="column-strategy-card"
                              key={item.column}
                            >
                              <div className="column-strategy-info">
                                <strong>{item.column}</strong>
                                <span>
                                  {item.inferredType} · {item.missingCount}{" "}
                                  missing values ({item.missingPercentage}%)
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
                                  {(item.availableStrategies || []).map(
                                    option => (
                                      <option
                                        key={option.value}
                                        value={option.value}
                                      >
                                        {option.label}
                                      </option>
                                    )
                                  )}
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
                        <p>
                          No missing values require a column-specific
                          strategy.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* INVALID VALUE EXPLORER */}

                <div className="column-cleaning-section">
                  <button
                    className="section-toggle"
                    type="button"
                    onClick={() =>
                      setInvalidSectionOpen(value => !value)
                    }
                    aria-expanded={invalidSectionOpen}
                  >
                    <span>
                      <h3>Invalid Value Treatment</h3>
                      <small>
                        {(cleaningPreview.schemaColumns || []).reduce(
                          (sum, item) =>
                            sum + (item.mismatchCount || 0),
                          0
                        )}{" "}
                        detected type mismatches
                      </small>
                    </span>

                    <ChevronDown
                      className={
                        invalidSectionOpen
                          ? "section-chevron open"
                          : "section-chevron"
                      }
                      size={18}
                    />
                  </button>

                  {invalidSectionOpen && (
                    <>
                      <p>
                        Select a column to inspect its invalid values.
                        Flagged rows are highlighted. You can exclude
                        individual rows from treatment.
                      </p>

                      {(cleaningPreview.schemaColumns || []).length > 0 ? (
                        <div className="issue-workspace">
                          <div className="issue-column-list">
                            {cleaningPreview.schemaColumns.map(item => (
                              <button
                                type="button"
                                key={item.column}
                                className={`issue-column-button ${
                                  selectedIssueColumn.invalid ===
                                  item.column
                                    ? "active"
                                    : ""
                                }`}
                                onClick={() =>
                                  setIssueColumn("invalid", item.column)
                                }
                              >
                                <strong>{item.column}</strong>
                                <span>
                                  {item.mismatchCount || 0} invalid
                                </span>
                              </button>
                            ))}
                          </div>

                          {(() => {
                            const item =
                              cleaningPreview.schemaColumns.find(
                                row =>
                                  row.column ===
                                  selectedIssueColumn.invalid
                              ) || cleaningPreview.schemaColumns[0];

                            const strategy =
                              invalidStrategies[item.column] || {
                                method: "keep",
                                expectedType: item.inferredType || "",
                                value: ""
                              };

                            const excluded =
                              invalidExcludedRows[item.column] || [];

                            const invalidRows = item.mismatches || [];

                            const allRows =
                              (selectedDataset.records || []).map(
                                (record, index) => {
                                  const mismatch = invalidRows.find(
                                    row => row.row === index + 2
                                  );

                                  return {
                                    row: index + 2,
                                    value: record[item.column],
                                    detectedType:
                                      mismatch?.detectedType || "—",
                                    expectedType:
                                      mismatch?.expectedType ||
                                      strategy.expectedType,
                                    invalid: Boolean(mismatch)
                                  };
                                }
                              );

                            const rowsToDisplay =
                              issueViewAllRows.invalid
                                ? allRows
                                : invalidRows.map(row => ({
                                    ...row,
                                    invalid: true
                                  }));

                            const pagination = getPaginatedRows(
                              rowsToDisplay,
                              "invalid"
                            );

                            return (
                              <div className="issue-detail-panel">
                                <div className="issue-detail-heading">
                                  <div>
                                    <h4>{item.column}</h4>
                                    <p>
                                      {invalidRows.length} mismatched
                                      values · {excluded.length} excluded
                                    </p>
                                  </div>

                                  <label className="inline-check">
                                    <input
                                      type="checkbox"
                                      checked={
                                        issueViewAllRows.invalid
                                      }
                                      onChange={event =>
                                        setIssueViewAllRows(previous => ({
                                          ...previous,
                                          invalid: event.target.checked
                                        }))
                                      }
                                    />
                                    Show all rows
                                  </label>
                                </div>

                                <div className="issue-controls">
                                  <label>
                                    Expected type
                                    <select
                                      value={strategy.expectedType || ""}
                                      onChange={event =>
                                        setInvalidStrategies(previous => ({
                                          ...previous,
                                          [item.column]: {
                                            ...strategy,
                                            expectedType: event.target.value
                                          }
                                        }))
                                      }
                                    >
                                      <option value="">Select type</option>
                                      <option value="numeric">Numeric</option>
                                      <option value="categorical">
                                        Text / Categorical
                                      </option>
                                      <option value="boolean">Boolean</option>
                                      <option value="date">Date</option>
                                    </select>
                                  </label>

                                  <label>
                                    Treatment
                                    <select
                                      value={strategy.method}
                                      onChange={event =>
                                        setInvalidStrategies(previous => ({
                                          ...previous,
                                          [item.column]: {
                                            ...strategy,
                                            method: event.target.value
                                          }
                                        }))
                                      }
                                    >
                                      <option value="keep">
                                        Keep unchanged
                                      </option>
                                      <option value="drop_rows">
                                        Remove affected rows
                                      </option>
                                      <option value="mode">
                                        Replace with mode
                                      </option>
                                      <option value="median">
                                        Replace with median
                                      </option>
                                      <option value="mean">
                                        Replace with mean
                                      </option>
                                      <option value="custom">
                                        Custom value
                                      </option>
                                    </select>
                                  </label>

                                  {strategy.method === "custom" && (
                                    <label>
                                      Replacement value
                                      <input
                                        value={strategy.value || ""}
                                        onChange={event =>
                                          setInvalidStrategies(previous => ({
                                            ...previous,
                                            [item.column]: {
                                              ...strategy,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                      />
                                    </label>
                                  )}
                                </div>

 
<div className="table-wrap issue-rows-table">
  <table>
    <thead>
      <tr>
        <th>Exclude</th>
        <th>Row</th>
        {datasetColumns.map(column => (
          <th key={column}>{column}</th>
        ))}
        <th>Detected type</th>
        <th>Expected type</th>
      </tr>
    </thead>

    <tbody>
      {pagination.rows.map((row, index) => {
        const record = getRecordForRow(row.row);

        return (
          <tr
            key={`${row.row}-${index}`}
            className={row.invalid ? "issue-highlight-row" : ""}
          >
            <td>
              {row.invalid ? (
                <input
                  type="checkbox"
                  checked={excluded.includes(row.row)}
                  onChange={event =>
                    setInvalidExcludedRows(previous => ({
                      ...previous,
                      [item.column]: event.target.checked
                        ? [...excluded, row.row]
                        : excluded.filter(value => value !== row.row)
                    }))
                  }
                />
              ) : "—"}
            </td>

            <td>{row.row}</td>

            {datasetColumns.map(column => (
              <td
                key={column}
                className={
                  row.invalid && column === item.column
                    ? "problem-cell"
                    : ""
                }
              >
                {String(record[column] ?? "")}
              </td>
            ))}

            <td>{row.detectedType || "—"}</td>
            <td>{row.expectedType || strategy.expectedType || "—"}</td>
          </tr>
        );
      })}

      {!pagination.rows.length && (
        <tr>
          <td colSpan={datasetColumns.length + 4}>
            No invalid values detected.
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>


                                {renderPagination(
                                  "invalid",
                                  pagination
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <p>No schema mismatches detected.</p>
                      )}
                    </>
                  )}
                </div>

                {/* OUTLIER EXPLORER */}

                <div className="column-cleaning-section">
                  <button
                    className="section-toggle"
                    type="button"
                    onClick={() =>
                      setOutlierSectionOpen(value => !value)
                    }
                    aria-expanded={outlierSectionOpen}
                  >
                    <span>
                      <h3>Outlier Treatment</h3>
                      <small>
                        {cleaningPreview.totalOutliers || 0} detected
                        outliers
                      </small>
                    </span>

                    <ChevronDown
                      className={
                        outlierSectionOpen
                          ? "section-chevron open"
                          : "section-chevron"
                      }
                      size={18}
                    />
                  </button>

                  {outlierSectionOpen && (
                    <>
                      <p>
                        Review outliers column by column. Adjust lower
                        and upper constraints independently. Flagged
                        rows are highlighted; exclude legitimate
                        observations from treatment.
                      </p>

                      {(cleaningPreview.outlierColumns || []).length > 0 ? (
                        <div className="issue-workspace">
                          <div className="issue-column-list">
                            {cleaningPreview.outlierColumns.map(item => (
                              <button
                                type="button"
                                key={item.column}
                                className={`issue-column-button ${
                                  selectedIssueColumn.outlier ===
                                  item.column
                                    ? "active"
                                    : ""
                                }`}
                                onClick={() =>
                                  setIssueColumn("outlier", item.column)
                                }
                              >
                                <strong>{item.column}</strong>
                                <span>
                                  {item.outlierCount || 0} outliers
                                </span>
                              </button>
                            ))}
                          </div>

                          {(() => {
                            const item =
                              cleaningPreview.outlierColumns.find(
                                row =>
                                  row.column ===
                                  selectedIssueColumn.outlier
                              ) || cleaningPreview.outlierColumns[0];

                            const strategy =
                              outlierStrategies[item.column] || {
                                method: "keep",
                                value: "",
                                lowerBound: item.lowerBound,
                                upperBound: item.upperBound
                              };

                            const excluded =
                              outlierExcludedRows[item.column] || [];

                            const flagged = item.outliers || [];

                            const allRows =
                              (selectedDataset.records || []).map(
                                (record, index) => {
                                  const outlier = flagged.find(
                                    row => row.row === index + 2
                                  );

                                  return {
                                    row: index + 2,
                                    value: record[item.column],
                                    direction:
                                      outlier?.direction || "",
                                    outlier: Boolean(outlier)
                                  };
                                }
                              );

                            const rowsToDisplay =
                              issueViewAllRows.outlier
                                ? allRows
                                : flagged.map(row => ({
                                    ...row,
                                    outlier: true
                                  }));

                            const pagination = getPaginatedRows(
                              rowsToDisplay,
                              "outlier"
                            );

                            return (
                              <div className="issue-detail-panel">
                                <div className="issue-detail-heading">
                                  <div>
                                    <h4>{item.column}</h4>
                                    <p>
                                      {flagged.length} flagged values ·{" "}
                                      {excluded.length} excluded
                                    </p>
                                  </div>

                                  <label className="inline-check">
                                    <input
                                      type="checkbox"
                                      checked={
                                        issueViewAllRows.outlier
                                      }
                                      onChange={event =>
                                        setIssueViewAllRows(previous => ({
                                          ...previous,
                                          outlier: event.target.checked
                                        }))
                                      }
                                    />
                                    Show all rows
                                  </label>
                                </div>

                                <div className="issue-controls">
                                  <label>
                                    Lower constraint
                                    <input
                                      type="number"
                                      value={
                                        strategy.lowerBound ?? ""
                                      }
                                      onChange={event =>
                                        setOutlierStrategies(previous => ({
                                          ...previous,
                                          [item.column]: {
                                            ...strategy,
                                            lowerBound:
                                              event.target.value === ""
                                                ? null
                                                : Number(
                                                    event.target.value
                                                  )
                                          }
                                        }))
                                      }
                                    />
                                  </label>

                                  <label>
                                    Upper constraint
                                    <input
                                      type="number"
                                      value={
                                        strategy.upperBound ?? ""
                                      }
                                      onChange={event =>
                                        setOutlierStrategies(previous => ({
                                          ...previous,
                                          [item.column]: {
                                            ...strategy,
                                            upperBound:
                                              event.target.value === ""
                                                ? null
                                                : Number(
                                                    event.target.value
                                                  )
                                          }
                                        }))
                                      }
                                    />
                                  </label>

                                  <label>
                                    Treatment
                                    <select
                                      value={strategy.method}
                                      onChange={event =>
                                        setOutlierStrategies(previous => ({
                                          ...previous,
                                          [item.column]: {
                                            ...strategy,
                                            method: event.target.value
                                          }
                                        }))
                                      }
                                    >
                                      <option value="keep">
                                        Keep unchanged
                                      </option>
                                      <option value="drop_rows">
                                        Remove affected rows
                                      </option>
                                      <option value="median">
                                        Replace with median
                                      </option>
                                      <option value="mean">
                                        Replace with mean
                                      </option>
                                      <option value="mode">
                                        Replace with mode
                                      </option>
                                      <option value="custom">
                                        Custom value
                                      </option>
                                    </select>
                                  </label>

                                  {strategy.method === "custom" && (
                                    <label>
                                      Replacement value
                                      <input
                                        value={strategy.value || ""}
                                        onChange={event =>
                                          setOutlierStrategies(previous => ({
                                            ...previous,
                                            [item.column]: {
                                              ...strategy,
                                              value: event.target.value
                                            }
                                          }))
                                        }
                                      />
                                    </label>
                                  )}
                                </div>

                                


                                {renderPagination(
                                  "outlier",
                                  pagination
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <p>No outliers detected.</p>
                      )}
                    </>
                  )}
                </div>

                {/* APPLY CLEANING */}

                <div className="cleaning-action">
                  <button
                    className="primary-button"
                    onClick={applyCleaning}
                    disabled={
                      cleaning ||
                      [
                        ...Object.values(columnStrategies),
                        ...Object.values(invalidStrategies),
                        ...Object.values(outlierStrategies)
                      ].some(
                        strategy =>
                          strategy.method === "custom" &&
                          !String(strategy.value || "").trim()
                      ) ||
                      Object.values(invalidStrategies).some(
                        strategy =>
                          strategy.method !== "keep" &&
                          !strategy.expectedType
                      )
                    }
                  >
                    <Sparkles size={16} />
                    {cleaning
                      ? "Applying..."
                      : "Apply cleaning and create new version"}
                  </button>
                </div>
              </>
            ) : (
              <p>Loading cleaning preview...</p>
            )}
          </section>
        )}

        {/* OPEN DATA EXPLORER */}

        <section
          className="panel open-data-panel"
          id="open-data"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                EXTERNAL API INTEGRATION
              </p>
              <h2>Open Data Explorer</h2>
              <p>
                Discover public datasets from Ireland's open-data
                catalogue.
              </p>
            </div>

            <div className="open-data-source">
              data.gov.ie
            </div>
          </div>

          <form
            className="open-data-search"
            onSubmit={searchOpenData}
          >
            <input
              type="search"
              value={openDataQuery}
              onChange={event =>
                setOpenDataQuery(event.target.value)
              }
              placeholder="Search public datasets..."
              aria-label="Search public datasets"
            />

            <button
              className="primary-button"
              type="submit"
              disabled={openDataLoading}
            >
              {openDataLoading
                ? "Searching..."
                : "Search catalogue"}
            </button>
          </form>

          {openDataError && (
            <div className="error-message">
              <AlertCircle size={17} />
              {openDataError}
            </div>
          )}

          {openDataLoading && (
            <p>
              Searching the Irish open-data catalogue...
            </p>
          )}

          {!openDataLoading &&
            openDataResults.length > 0 && (
              <>
                <p className="open-data-count">
                  Showing {openDataResults.length} results from{" "}
                  {openDataTotal.toLocaleString()} matching catalogue
                  records.
                </p>

                <div className="open-data-results">
                  {openDataResults.map(dataset => (
                    <article
                      className="open-data-card"
                      key={dataset.id}
                    >
                      <div className="open-data-card-heading">
                        <div>
                          <h3>{dataset.title}</h3>
                          <span>{dataset.organization}</span>
                        </div>

                        <span className="status-pill good">
                          Public dataset
                        </span>
                      </div>

                      <p className="open-data-description">
                        {dataset.description ||
                          "No description provided by the publisher."}
                      </p>

                      <div className="open-data-meta">
                        <span>
                          <strong>Licence:</strong>{" "}
                          {dataset.license}
                        </span>

                        <span>
                          <strong>Modified:</strong>{" "}
                          {dataset.modified
                            ? new Date(
                                dataset.modified
                              ).toLocaleDateString()
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

                          {dataset.resources
                            .slice(0, 4)
                            .map(resource => (
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
                        View dataset on data.gov.ie{" "}
                        <ArrowUpRight size={15} />
                      </a>
                    </article>
                  ))}
                </div>
              </>
            )}

          {!openDataLoading &&
            openDataResults.length === 0 &&
            !openDataError && (
              <p className="open-data-empty">
                Search for transport, housing, population or other
                public datasets.
              </p>
            )}
        </section>

        {/* NON-BLOCKING RECENT TASKS */}
        {activityTasks.length > 0 && (
          <aside className="activity-tray" aria-live="polite" aria-label="Recent task activity">
            <div className="activity-tray-heading"><strong>Recent activity</strong><span>Last {activityTasks.length} tasks</span></div>
            <div className="activity-task-list">
              {activityTasks.map(task => (
                <div className="activity-task" key={task.id}>
                  <div className="activity-task-top">
                    <span className="activity-task-label" title={task.label}>{task.label}</span>
                    {task.status === "complete" ? <span className="activity-task-done"><CheckCircle2 size={15}/> Done</span> : task.status === "error" ? <span className="activity-task-error"><AlertCircle size={15}/> Failed</span> : <span className="activity-task-percent">{task.progress}%</span>}
                  </div>
                  {task.status === "running" && <div className="activity-progress-track"><div style={{width: `${task.progress}%`}} /></div>}
                  {task.status === "error" && task.errorLabel && <small className="activity-error-detail">{task.errorLabel}</small>}
                </div>
              ))}
            </div>
          </aside>
        )}

        {/* FOOTER */}

        <footer className="footer">
          <span>DataLens</span>
          <span>© 2026C Sahil Mokashi</span>
        </footer>
      </main>
    </div>
  );
}

// --------------------------------------------------
// METRIC CARD
// --------------------------------------------------

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
