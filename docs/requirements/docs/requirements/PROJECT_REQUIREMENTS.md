
# DataLens - Project Requirements Specification

## 1. Project Overview

### 1.1 Project Name
DataLens - Data Quality Assessment, Monitoring and Remediation Platform.

### 1.2 Problem Statement

Organisations frequently work with datasets containing missing
values, duplicate records, invalid formats, inconsistent values
and unusual observations.

These problems can reduce the reliability of reports, dashboards
and downstream data processing systems.

Identifying and correcting these issues manually can be time
consuming and inconsistent.

DataLens aims to provide a web-based platform that allows users
to upload datasets, assess their quality, identify issues,
preview supported corrections and maintain a history of changes.

### 1.3 Project Aim

To design, develop, test and deploy a full-stack web application
that provides transparent and explainable data quality
assessment, monitoring and remediation capabilities.

## 2. Target Users and Stakeholders

### 2.1 Data Analysts
Need to assess datasets before using them for reporting,
visualisation and analysis.

### 2.2 Data Engineers
Need to identify data quality problems and apply controlled,
traceable corrections before data enters downstream systems.

### 2.3 Data Quality Administrators
Need to manage datasets, monitor quality and review
data quality issues.

### 2.4 Students and Researchers
Need an accessible platform for exploring dataset quality
and understanding common data quality problems.

## 3. Functional Requirements

### FR-01: User Registration
The system shall allow new users to create accounts.

### FR-02: User Authentication
The system shall allow registered users to log in and log out.

### FR-03: Dataset Upload
The system shall allow authenticated users to upload CSV datasets.

### FR-04: Dataset Management
Users shall be able to view, rename and delete their own datasets.

### FR-05: Dataset Profiling
The system shall calculate dataset statistics, including
row counts, column counts, data types, missing values,
distinct values and basic distributions.

### FR-06: Data Quality Validation
The system shall identify predefined quality issues,
including missing values, duplicate records, invalid formats,
inconsistent values and statistical anomalies.

### FR-07: Quality Scoring
The system shall calculate an explainable quality score
using documented dimensions and configurable rules.

### FR-08: Issue Exploration
Users shall be able to inspect detected issues, their severity,
affected columns and example affected records.

### FR-09: Remediation Preview
Users shall be able to preview supported corrections
before applying them.

### FR-10: Remediation Application
Users shall be able to apply supported corrections
to a derived dataset version.

### FR-11: Remediation Reversal
Users shall be able to restore an earlier dataset version
without modifying the original uploaded file.

### FR-12: Version Management
The system shall maintain dataset version history.

### FR-13: Version Comparison
Users shall be able to compare dataset versions and
identify changes in quality scores and detected issues.

### FR-14: Quality Reports
Users shall be able to generate and download reports
containing profiling results and quality assessments.

### FR-15: Cleaned Dataset Export
Users shall be able to download a processed CSV dataset.

### FR-16: External Dataset Integration
The system shall provide a meaningful integration with
an external open-data service to discover or import
public datasets, subject to service availability.

### FR-17: Audit History
The system shall record relevant dataset operations
and remediation activities.

## 4. Non-Functional Requirements

### NFR-01: Usability
The application should provide clear navigation,
understandable feedback and consistent interactions.

### NFR-02: Accessibility
The interface should use semantic HTML, accessible labels,
keyboard-operable controls and sufficient colour contrast.

### NFR-03: Responsiveness
The interface should adapt to desktop, tablet and mobile
screen sizes.

### NFR-04: Security
Passwords must never be stored in plaintext.
Protected resources must be authorised on the server.
Sensitive configuration must be kept outside source control.

### NFR-05: Data Integrity
Original uploaded datasets must remain unchanged.
Corrections must produce traceable derived versions.

### NFR-06: Maintainability
The application should use modular components,
separation of concerns and consistent coding standards.

### NFR-07: Reliability
The application should handle invalid input, failed
requests and unavailable external services gracefully.

### NFR-08: Performance
Dataset processing and user-facing operations should
be evaluated using documented test datasets and
measured execution times.

### NFR-09: Deployment
The application must be publicly accessible through
a cloud deployment.

### NFR-10: Documentation
The project must include setup instructions,
architecture documentation, API documentation
and relevant testing evidence.

## 5. Scope

### 5.1 Included in the Current Project

- User registration and authentication
- CSV dataset upload and management
- Dataset profiling
- Rule-based quality issue detection
- Explainable quality scoring
- Preview and application of supported corrections
- Dataset versioning and comparison
- Quality report generation
- Cleaned CSV export
- External open-data integration
- Audit history
- Automated testing and cloud deployment

### 5.2 Excluded from the Current Project

- AI-based data quality recommendations
- AI-generated data corrections
- Predictive machine learning models
- Real-time enterprise streaming pipelines
- Direct integrations with commercial data warehouses

AI-based analysis and correction may be explored
as a separate future dissertation extension.

They are not part of the implemented functionality
or assessment claims for this project.

## 6. Project Constraints and Assumptions

- The application will use a JavaScript-based full-stack architecture.
- The initial supported upload format will be CSV.
- Dataset ownership will be enforced through backend authorisation.
- Original datasets will be preserved.
- External API availability cannot be guaranteed.
- Dataset size and processing limits will be established
  through feasibility testing.
- The system will be developed and tested incrementally.

## 7. Acceptance Criteria

| Requirement | Acceptance condition |
|---|---|
| Authentication | A user can register, log in and log out. |
| Dataset upload | A valid CSV can be uploaded and stored. |
| Dataset ownership | A user cannot access another user's private dataset. |
| Profiling | The application produces statistics for uploaded columns. |
| Issue detection | Known test cases produce the expected validation issues. |
| Quality scoring | The same input and rules produce reproducible scores. |
| Remediation | Users can preview and apply supported corrections. |
| Versioning | Original and processed versions remain distinguishable. |
| Comparison | Differences between versions can be displayed. |
| Reporting | Users can download a quality report. |
| External integration | The application handles successful and failed external API requests. |
| Deployment | The public application can be accessed and tested. |

## 8. Future Evaluation

The completed system will be evaluated against these
requirements using automated tests, manual tests,
security checks, accessibility checks and deployment
verification.

Actual results, limitations and outstanding defects
will be recorded during implementation.
