const DATA_CONFIG = {
    repoOwner: 'PLACEHOLDER_REPO_OWNER',
    repoName: 'PLACEHOLDER_REPO_NAME',
    dataBranch: 'data',

    getDataBaseUrl() {
        return `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.dataBranch}`;
    },

    getDataUrl(filePath) {
        return `${this.getDataBaseUrl()}/${filePath}`;
    }
};
