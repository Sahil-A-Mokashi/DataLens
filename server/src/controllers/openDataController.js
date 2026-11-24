
const searchOpenData = async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const requestedRows = Number(req.query.rows || 8);

    if (query.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search term must contain at least 2 characters"
      });
    }

    if (query.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search term is too long"
      });
    }

    const rows = Number.isInteger(requestedRows)
      ? Math.min(Math.max(requestedRows, 1), 10)
      : 8;

    const apiUrl = new URL(
      "https://data.gov.ie/api/3/action/package_search"
    );

    apiUrl.searchParams.set("q", query);
    apiUrl.searchParams.set("rows", String(rows));

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      throw new Error(`Open Data API returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error("Open Data API reported an unsuccessful response");
    }

    const datasets = (data.result?.results || []).map(item => ({
      id: item.id,
      title: item.title || item.name,
      description: item.notes || "",
      organization: item.organization?.title || "Not specified",
      license: item.license_title || "Not specified",
      modified: item.metadata_modified || null,
      tags: (item.tags || []).map(tag => tag.display_name),
      resources: (item.resources || []).map(resource => ({
        id: resource.id,
        name: resource.name || "Unnamed resource",
        format: resource.format || "Unknown",
        url: resource.url
      })),
      portalUrl: `https://data.gov.ie/dataset/${item.name}`
    }));

    return res.status(200).json({
      success: true,
      source: "data.gov.ie",
      query,
      count: datasets.length,
      total: data.result?.count || 0,
      datasets
    });
  } catch (error) {
    console.error("Open Data API error:", error.message);

    return res.status(502).json({
      success: false,
      message: "The Irish Open Data service is temporarily unavailable"
    });
  }
};

module.exports = { searchOpenData };
