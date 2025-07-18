// Google Drive API設定
const CLIENT_ID = '431846331711-eo7imsmnmslam4mpangb9frpgvbgiluu.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;
let isGapiLoaded = false;
let isGisLoaded = false;
let dataFileId = null;
let timeData = {
    totalMinutes: 0,
    entries: [],
    lastModified: new Date().toISOString()
};

// Google API (gapi) 初期化
function gapiLoaded() {
    console.log('Google API loaded');
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    console.log('Initializing Google API client');
    // APIキー不要でOAuth認証のみ使用
    await gapi.client.init({
        discoveryDocs: [DISCOVERY_DOC],
    });
    isGapiLoaded = true;
    console.log('Google API client initialized');
    maybeEnableButtons();
}

// Google Identity Services (GIS) 初期化
function gisLoaded() {
    console.log('Google Identity Services loaded');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 後で設定
    });
    isGisLoaded = true;
    console.log('Google Identity Services initialized');
    maybeEnableButtons();
}

// 両方のAPIが読み込まれた後にボタンを有効化
function maybeEnableButtons() {
    if (isGapiLoaded && isGisLoaded) {
        console.log('Both APIs loaded, rendering sign-in button');
        // サインインボタンを表示
        google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: handleCredentialResponse
        });
        
        // OAuth2 サインインボタンを作成
        const buttonDiv = document.getElementById('buttonDiv');
        buttonDiv.innerHTML = `
            <button class="btn" onclick="handleAuthClick()">Googleアカウントでログイン</button>
        `;
    }
}

// 認証応答処理（ID Token用）
function handleCredentialResponse(response) {
    console.log('ID Token received');
    // ID tokenは表示用のユーザー情報のみ
    // 実際のAPI呼び出しにはaccess tokenが必要
}

// 認証クリック処理
function handleAuthClick() {
    console.log('Auth button clicked');
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Token error:', resp.error);
            showStatus('認証に失敗しました: ' + resp.error, 'error');
            return;
        }
        
        console.log('Access token received');
        accessToken = resp.access_token;
        
        // アクセストークンを設定
        gapi.client.setToken({
            access_token: accessToken
        });
        
        try {
            await loadData();
            showMainApp();
            showStatus('ログイン成功', 'success');
        } catch (error) {
            console.error('Error after authentication:', error);
            showStatus('データの読み込みに失敗しました', 'error');
        }
    };
    
    if (accessToken === null) {
        // トークンをリクエスト
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // 既存のトークンで再認証
        tokenClient.requestAccessToken({prompt: ''});
    }
}

// サインアウト処理
function handleSignOut() {
    console.log('Sign out clicked');
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken);
        accessToken = null;
        gapi.client.setToken('');
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('mainApp').style.display = 'none';
        showStatus('ログアウトしました', 'info');
    }
}

// メインアプリ表示
function showMainApp() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    updateDisplay();
}

// データ読み込み
async function loadData() {
    console.log('Loading data...');
    
    try {
        // timetrack フォルダを検索
        const folderResponse = await gapi.client.drive.files.list({
            q: "name='timetrack' and mimeType='application/vnd.google-apps.folder'"
        });
        
        console.log('Folder response:', folderResponse);
        
        let folderId;
        if (folderResponse.result.files.length === 0) {
            // フォルダが存在しない場合は作成
            const createFolderResponse = await gapi.client.drive.files.create({
                resource: {
                    name: 'timetrack',
                    mimeType: 'application/vnd.google-apps.folder'
                }
            });
            folderId = createFolderResponse.result.id;
        } else {
            folderId = folderResponse.result.files[0].id;
        }
        
        console.log('Folder ID:', folderId);
        
        // data.json を検索
        const fileResponse = await gapi.client.drive.files.list({
            q: `name='data.json' and parents='${folderId}'`
        });
        
        console.log('File response:', fileResponse);
        
        if (fileResponse.result.files.length === 0) {
            // ファイルが存在しない場合は初期データで作成
            console.log('No data file found, creating initial data');
            await saveData();
        } else {
            dataFileId = fileResponse.result.files[0].id;
            console.log('Data file ID:', dataFileId);
            
            // ファイルの内容を読み込み
            const contentResponse = await gapi.client.drive.files.get({
                fileId: dataFileId,
                alt: 'media'
            });
            
            try {
                timeData = JSON.parse(contentResponse.body);
                console.log('Data loaded successfully:', timeData);
            } catch (error) {
                console.error('Error parsing data:', error);
                timeData = {
                    totalMinutes: 0,
                    entries: [],
                    lastModified: new Date().toISOString()
                };
            }
        }
    } catch (error) {
        console.error('Error loading data:', error);
        throw error;
    }
}

// データ保存
async function saveData() {
    try {
        timeData.lastModified = new Date().toISOString();
        const content = JSON.stringify(timeData, null, 2);
        
        if (dataFileId) {
            // 既存ファイルを更新
            await gapi.client.request({
                path: `https://www.googleapis.com/upload/drive/v3/files/${dataFileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                headers: { 'Content-Type': 'application/json' },
                body: content
            });
        } else {
            // 新規ファイル作成
            const folderResponse = await gapi.client.drive.files.list({
                q: "name='timetrack' and mimeType='application/vnd.google-apps.folder'"
            });
            const folderId = folderResponse.result.files[0].id;
            
            const response = await gapi.client.request({
                path: 'https://www.googleapis.com/upload/drive/v3/files',
                method: 'POST',
                params: { uploadType: 'multipart' },
                headers: { 'Content-Type': 'multipart/related; boundary="boundary"' },
                body: createMultipartBody({
                    name: 'data.json',
                    parents: [folderId]
                }, content)
            });
            
            dataFileId = JSON.parse(response.body).id;
        }
        
        // 日次バックアップ作成
        await createBackup();
        
    } catch (error) {
        console.error('データの保存に失敗:', error);
        showStatus('データの保存に失敗しました', 'error');
    }
}

// バックアップ作成
async function createBackup() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const backupName = `backup-${today}.json`;
        
        const folderResponse = await gapi.client.drive.files.list({
            q: "name='timetrack' and mimeType='application/vnd.google-apps.folder'"
        });
        const folderId = folderResponse.result.files[0].id;
        
        // 同じ日のバックアップが既に存在するかチェック
        const existingBackup = await gapi.client.drive.files.list({
            q: `name='${backupName}' and parents='${folderId}'`
        });
        
        if (existingBackup.result.files.length === 0) {
            await gapi.client.request({
                path: 'https://www.googleapis.com/upload/drive/v3/files',
                method: 'POST',
                params: { uploadType: 'multipart' },
                headers: { 'Content-Type': 'multipart/related; boundary="boundary"' },
                body: createMultipartBody({
                    name: backupName,
                    parents: [folderId]
                }, JSON.stringify(timeData, null, 2))
            });
        }
    } catch (error) {
        console.error('バックアップの作成に失敗:', error);
    }
}

// マルチパートボディ作成
function createMultipartBody(metadata, data) {
    const boundary = 'boundary';
    const delimiter = '\r\n--' + boundary + '\r\n';
    const close_delim = '\r\n--' + boundary + '--';
    
    let body = delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) + delimiter +
        'Content-Type: application/json\r\n\r\n' +
        data + close_delim;
    
    return body;
}

// 時間追加
async function addTime() {
    const hours = parseInt(document.getElementById('hours').value) || 0;
    const minutes = parseInt(document.getElementById('minutes').value) || 0;
    const note = document.getElementById('note').value.trim();
    
    if (hours === 0 && minutes === 0) {
        showStatus('時間を入力してください', 'error');
        return;
    }
    
    const totalMinutes = hours * 60 + minutes;
    const entry = {
        id: Date.now().toString(),
        minutes: totalMinutes,
        timestamp: new Date().toISOString(),
        note: note
    };
    
    timeData.entries.unshift(entry);
    timeData.totalMinutes += totalMinutes;
    
    await saveData();
    updateDisplay();
    
    // フォームリセット
    document.getElementById('hours').value = 0;
    document.getElementById('minutes').value = 0;
    document.getElementById('note').value = '';
    
    showStatus(`${formatTime(totalMinutes)}を追加しました`, 'success');
}

// クイック追加
async function quickAdd(minutes) {
    const entry = {
        id: Date.now().toString(),
        minutes: minutes,
        timestamp: new Date().toISOString(),
        note: ''
    };
    
    timeData.entries.unshift(entry);
    timeData.totalMinutes += minutes;
    
    await saveData();
    updateDisplay();
    
    showStatus(`${formatTime(minutes)}を追加しました`, 'success');
}

// 表示更新
function updateDisplay() {
    document.getElementById('totalTime').textContent = formatTime(timeData.totalMinutes);
    
    const historyDiv = document.getElementById('history');
    if (timeData.entries.length === 0) {
        historyDiv.innerHTML = '<div class="history-item"><span class="history-date">履歴がありません</span></div>';
        return;
    }
    
    const recentEntries = timeData.entries.slice(0, 10);
    historyDiv.innerHTML = recentEntries.map(entry => `
        <div class="history-item">
            <div>
                <div class="history-time">${formatTime(entry.minutes)}</div>
                <div class="history-date">${formatDate(entry.timestamp)}</div>
                ${entry.note ? `<div class="history-note">${entry.note}</div>` : ''}
            </div>
        </div>
    `).join('');
}

// 時間フォーマット
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${mins}分`;
}

// 日付フォーマット
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ja-JP');
}

// CSVエクスポート
function exportData() {
    if (timeData.entries.length === 0) {
        showStatus('エクスポートするデータがありません', 'error');
        return;
    }
    
    const csvContent = [
        ['日時', '時間（分）', '時間（表示）', 'メモ'],
        ...timeData.entries.map(entry => [
            formatDate(entry.timestamp),
            entry.minutes,
            formatTime(entry.minutes),
            entry.note || ''
        ])
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `timetrack_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showStatus('CSVファイルをダウンロードしました', 'success');
}

// ステータス表示
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// 初期化
window.onload = function() {
    console.log('Page loaded');
    
    // Google API読み込み確認
    if (typeof gapi !== 'undefined') {
        gapiLoaded();
    } else {
        console.log('Waiting for Google API...');
        setTimeout(() => {
            if (typeof gapi !== 'undefined') {
                gapiLoaded();
            } else {
                showStatus('Google APIの読み込みに失敗しました', 'error');
            }
        }, 2000);
    }
    
    // Google Identity Services読み込み確認
    if (typeof google !== 'undefined' && google.accounts) {
        gisLoaded();
    } else {
        console.log('Waiting for Google Identity Services...');
        setTimeout(() => {
            if (typeof google !== 'undefined' && google.accounts) {
                gisLoaded();
            } else {
                showStatus('Google Identity Servicesの読み込みに失敗しました', 'error');
            }
        }, 2000);
    }
};