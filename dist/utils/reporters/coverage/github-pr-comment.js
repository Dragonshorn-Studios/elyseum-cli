class GithubPRCommentCoverageReporter {
    constructor() {
        this.coverage_low = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M2.344 2.343h-.001a8 8 0 0 1 11.314 11.314A8.002 8.002 0 0 1 .234 10.089a8 8 0 0 1 2.11-7.746Zm1.06 10.253a6.5 6.5 0 1 0 9.108-9.275 6.5 6.5 0 0 0-9.108 9.275ZM6.03 4.97 8 6.94l1.97-1.97a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l1.97 1.97a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-1.97 1.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L6.94 8 4.97 6.03a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018Z"></path></svg>`;
        this.coverage_med = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path></svg>`;
        this.coverage_high = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm1.5 0a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm10.28-1.72-4.5 4.5a.75.75 0 0 1-1.06 0l-2-2a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l1.47 1.47 3.97-3.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path></svg>`;
        this.quality_gate_passed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm16.28-2.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018l-5.97 5.97-2.47-2.47a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l3 3a.75.75 0 0 0 1.06 0Z"></path></svg>`;
        this.quality_gate_failed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm8.036-4.024a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L10.939 12l-2.963 2.963a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L12 13.06l2.963 2.964a.75.75 0 0 0 1.061-1.06L13.061 12l2.963-2.964a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L12 10.939Z"></path></svg>`;
    }
    report(diffCoverage, { details = false, qualityGate = 80 } = {}) {
        let summary = `| Type      | Total | Covered | Percent |\n`;
        summary += `|-----------|-------|---------|---------|\n`;
        summary += `| Lines     | ${diffCoverage.lines.total} | ${diffCoverage.lines.covered} | ${this.getIcon(diffCoverage.lines.percent)} ${diffCoverage.lines.percent.toFixed(2)}% |\n`;
        summary += `| Functions | ${diffCoverage.functions.total} | ${diffCoverage.functions.covered} | ${this.getIcon(diffCoverage.functions.percent)} ${diffCoverage.functions.percent.toFixed(2)}% |\n`;
        summary += `| Branches  | ${diffCoverage.branches.total} | ${diffCoverage.branches.covered} | ${this.getIcon(diffCoverage.branches.percent)} ${diffCoverage.branches.percent.toFixed(2)}% |\n`;
        let markdown = `## Coverage Summary\n\n${summary}`;
        // lines, functions, branches average percentage must be greater than or equal to qualityGate
        const qualityGateFailed = diffCoverage.lines.percent < qualityGate ||
            diffCoverage.functions.percent < qualityGate ||
            diffCoverage.branches.percent < qualityGate;
        markdown += `\n\n### Coverage Quality Gate: ${qualityGateFailed
            ? `Failed <span style='color: #cb2431;'>${this.quality_gate_failed}</span>`
            : `Passed <span style='color: #28a745;'>${this.quality_gate_passed}</span>`}`;
        let detailsTable = `\n<details>\n<summary>Coverage Details</summary>\n\n`;
        detailsTable += `| File | Lines (%) | Functions (%) | Branches (%) |\n`;
        detailsTable += `|------|-----------|---------------|--------------|\n`;
        for (const file of diffCoverage.files) {
            detailsTable += `| ${file.file} | ${file.lines.covered}/${file.lines.total} (${file.lines.percent.toFixed(2)}%) | ${file.functions.covered}/${file.functions.total} (${this.percentOrNA(file.functions.percent)}) | ${file.branches.covered}/${file.branches.total} (${this.percentOrNA(file.branches.percent)}) |\n`;
        }
        detailsTable += `\n</details>\n`;
        markdown += detailsTable;
        console.log(markdown);
    }
    getIcon(percent) {
        if (percent >= 80) {
            return `<span style='color: #28a745;'>${this.coverage_high}</span>`;
        }
        else if (percent >= 50) {
            return `<span style='color: #f66a0a;'>${this.coverage_med}</span>`;
        }
        else {
            return `<span style='color: #cb2431;'>${this.coverage_low}</span>`;
        }
    }
    percentOrNA(percent) {
        return !isNaN(percent) ? percent.toFixed(2) + "%" : "N/A";
    }
}
export { GithubPRCommentCoverageReporter };
