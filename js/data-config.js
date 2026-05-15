const DATA_CONFIG = {
    repoOwner: 'DAgentSec',
    repoName: 'Agent-Security-Paper-Daily',
    dataBranch: 'data',

    getDataBaseUrl() {
        return `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.dataBranch}`;
    },

    getDataUrl(filePath) {
        return `${this.getDataBaseUrl()}/${filePath}`;
    }
};
