// 毎日自動でバックアップ作成
function createDailyBackup() {
    const today = new Date().toISOString().split('T')[0];
    const backupName = `backup/${today}.json`;
    // Google Driveに保存
  }
// Google Drive APIクライアント
class DriveStorage {
    async loadData() {
      const response = await gapi.client.drive.files.get({
        fileId: 'timeaddmachine-data-file-id',
        alt: 'media'
      });
      return JSON.parse(response.body);
    }
    
    async saveData(data) {
      const metadata = {
        name: 'data.json',
        parents: ['timeaddmachine-folder-id']
      };
      
      await gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': 'multipart/related' },
        body: createMultipartBody(metadata, JSON.stringify(data))
      });
    }
  }