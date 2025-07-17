
        // Google Drive API設定
        const CLIENT_ID = '431846331711-ld6uvodr8dom5thhqld9afg7qklg24ra.apps.googleusercontent.com';
        // APIキーは使用せず、OAuth認証のみで動作
        const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
        const SCOPES = 'https://www.googleapis.com/auth/drive.file';
        
        let isInitialized = false;
        let dataFileId = null;
        let timeData = {
            totalMinutes: 0,
            entries: [],
            lastModified: new Date().toISOString()
        };
        
        // Google APIスクリプトの読み込み完了を待つ
        function waitForGapi() {
            if (typeof gapi !== 'undefined' && gapi.load) {
                console.log('Google API is ready');
                gapi.load('client:auth2', initializeGapi);
            } else {
                console.log('Waiting for Google API...');
                setTimeout(waitForGapi, 100);
            }
        }
        
        // 初期化
        function initialize() {
            console.log('Starting initialization...');
            waitForGapi();
        }
        
        function initializeGapi() {
            console.log('Initializing Google API...');
            
            gapi.client.init({
                clientId: CLIENT_ID,
                discoveryDocs: [DISCOVERY_DOC],
                scope: SCOPES
            }).then(() => {
                console.log('Google API initialized successfully');
                isInitialized = true;
                
                // 既にログイン済みかチェック
                const authInstance = gapi.auth2.getAuthInstance();
                if (authInstance && authInstance.isSignedIn.get()) {
                    loadData().then(() => {
                        showMainApp();
                    });
                } else {
                    console.log('User not signed in');
                }
            }).catch(error => {
                console.error('Error initializing Google API:', error);
                showStatus('Google APIの初期化に失敗しました: ' + error.message, 'error');
            });
        }
        
        // 認証
        function authorize() {
            console.log('Authorize called, isInitialized:', isInitialized);
            
            if (!isInitialized) {
                showStatus('Google APIを初期化中です。しばらくお待ちください...', 'info');
                
                // 5秒後に再試行
                setTimeout(() => {
                    if (isInitialized) {
                        authorize();
                    } else {
                        showStatus('初期化に時間がかかっています。CLIENT_IDが正しく設定されているか確認してください。', 'error');
                    }
                }, 5000);
                return;
            }
            
            const authInstance = gapi.auth2.getAuthInstance();
            if (!authInstance) {
                showStatus('認証インスタンスが見つかりません', 'error');
                return;
            }
            
            authInstance.signIn().then(() => {
                console.log('User signed in successfully');
                loadData().then(() => {
                    showMainApp();
                    showStatus('ログイン成功', 'success');
                });
            }).catch(error => {
                console.error('Sign in error:', error);
                showStatus('ログインに失敗しました: ' + error.error, 'error');
            });
        }
        
        // メインアプリ表示
        function showMainApp() {
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            updateDisplay();
        }
        
        // データ読み込み
        function loadData() {
            return new Promise((resolve, reject) => {
                console.log('Loading data...');
                
                // timetrack フォルダを検索
                gapi.client.drive.files.list({
                    q: "name='timetrack' and mimeType='application/vnd.google-apps.folder'"
                }).then(folderResponse => {
                    console.log('Folder response:', folderResponse);
                    
                    let folderId;
                    if (folderResponse.result.files.length === 0) {
                        // フォルダが存在しない場合は作成
                        return gapi.client.drive.files.create({
                            resource: {
                                name: 'timetrack',
                                mimeType: 'application/vnd.google-apps.folder'
                            }
                        });
                    } else {
                        folderId = folderResponse.result.files[0].id;
                        return { result: { id: folderId } };
                    }
                }).then(folderResult => {
                    const folderId = folderResult.result.id;
                    console.log('Folder ID:', folderId);
                    
                    // data.json を検索
                    return gapi.client.drive.files.list({
                        q: `name='data.json' and parents='${folderId}'`
                    });
                }).then(fileResponse => {
                    console.log('File response:', fileResponse);
                    
                    if (fileResponse.result.files.length === 0) {
                        // ファイルが存在しない場合は初期データで作成
                        console.log('No data file found, creating initial data');
                        return saveData().then(() => resolve());
                    } else {
                        dataFileId = fileResponse.result.files[0].id;
                        console.log('Data file ID:', dataFileId);
                        
                        // ファイルの内容を読み込み
                        return gapi.client.drive.files.get({
                            fileId: dataFileId,
                            alt: 'media'
                        });
                    }
                }).then(contentResponse => {
                    if (contentResponse && contentResponse.body) {
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
                    resolve();
                }).catch(error => {
                    console.error('Error loading data:', error);
                    showStatus('データの読み込みに失敗しました: ' + error.message, 'error');
                    reject(error);
                });
            });
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
        
        // 初期化実行
        function init() {
            console.log('Init function called');
            initialize();
        }
        
        // 通常のwindow.onload
        window.onload = function() {
            console.log('Page loaded');
            
            // Google APIが読み込まれているかチェック
            if (typeof gapi !== 'undefined') {
                console.log('Google API available, starting initialization');
                initialize();
            } else {
                console.log('Google API not available, waiting...');
                // 少し待ってから再試行
                setTimeout(() => {
                    if (typeof gapi !== 'undefined') {
                        console.log('Google API now available');
                        initialize();
                    } else {
                        console.error('Google API still not available');
                        showStatus('Google APIの読み込みに失敗しました。ページを再読み込みしてください。', 'error');
                    }
                }, 2000);
            }
        };