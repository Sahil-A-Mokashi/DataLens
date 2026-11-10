# DataLens

A web app that helps users determine whether a dataset can be trusted before using it for analysis.
- Upload CSV files and automatically detect missing values, duplicates, outliers, and inconsistent formats.
- Generate a data quality score and visual reports.
- Track quality changes between dataset versions.
- Recommend possible fixes and allow users to download cleaned datasets.
MERN Stack

A Smart Data Reliability Assessment, Monitoring and Remediation Platform

Making data quality measurable, explainable and continuously improvable.

Project category: Full-stack web-based information system.

Technology: MongoDB, Express.js, React.js and Node.js.

Intended users:
- Data analysts
- Data engineers
- Business intelligence teams
- Data quality administrators
- Students and researchers working with datasets


Problem we are solving
Data quality issues are frequently discovered only after datasets have been used in reporting, analytics or downstream processing.

Existing tools can provide data profiling and validation, but users may still need to configure rules, interpret results and manage corrections across dataset versions.

DataLens aims to bring these activities into one accessible platform.
Our main objectives
ID	Measurable objective
O1	Allow authenticated users to upload and manage CSV datasets.
O2	Automatically profile columns and detect predefined data quality issues.
O3	Generate transparent, explainable quality scores.
O4	Allow users to preview, apply and reverse supported corrections.
O5	Compare dataset versions and identify quality regressions[later addition].
O6	Generate downloadable quality reports and cleaned datasets[later addition].
O7	Deploy a secure, tested, publicly accessible MERN application.


Module	Features	Priority
User management	Registration, login, profiles, roles	Essential
Dataset management	Upload, preview, search, CRUD, delete	Essential
Profiling engine	Statistics, nulls, duplicates, data types	Essential
Quality engine	Rules, scores, issue severity, explanations	Essential
Remediation	Preview, apply, undo, export	Essential
Version monitoring	Comparisons, historical scores, regression alerts	Essential
Reports	Downloadable CSV and PDF reports	Advanced
External integration	Public dataset discovery and import	Advanced
AI integration	Future service interface only	Reserved


API design
We should have proper REST endpoints with CRUD operations.
Method	Endpoint	Purpose
POST	/api/auth/register	Register
POST	/api/auth/login	Login
POST	/api/datasets	Upload dataset
GET	/api/datasets	List datasets
GET	/api/datasets/:id	Dataset details
PATCH	/api/datasets/:id	Update metadata
DELETE	/api/datasets/:id	Delete dataset
POST	/api/datasets/:id/profile	Run profiling
GET	/api/datasets/:id/quality	Retrieve quality score
GET	/api/datasets/:id/issues	Retrieve issues
POST	/api/remediation/preview	Preview corrections
POST	/api/remediation/apply	Apply approved corrections
POST	/api/remediation/:id/undo	Reverse correction
GET	/api/datasets/:id/versions	List versions
GET	/api/versions/compare	Compare versions
GET	/api/reports/:id/download	Download report




Security and testing 
We should treat security as a design requirement, not something added at the end. Here i will try to include as many of security precautions as possible given the time frame.

Threat	Planned protection
Password compromise	bcrypt or Argon2 password hashing
Unauthorised access	Authentication and server-side role checks
NoSQL injection	Strict schemas, input validation and sanitisation
XSS	Output escaping and appropriate CSP
CSRF	Appropriate cookie and request protections
Malicious CSV upload	File type validation, size limits, safe parsing
CSV formula injection	Safe handling of exported spreadsheet cells
IDOR	Ownership checks on every dataset operation
Data leakage	User-specific access controls and minimal data retention
API abuse	Rate limiting and request limits