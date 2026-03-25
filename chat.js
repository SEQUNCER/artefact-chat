// Supabase configuration
const SUPABASE_URL = 'https://srwqsqnvylshjknezskz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyd3FzcW52eWxzaGprbmV6c2t6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MTUxMDMsImV4cCI6MjA4OTk5MTEwM30.05fWsv3FZIiSmmaaVfVrsUk2t2DHixURNao1DTVtoLY';

// Состояние
let supabase = null;
let isSupabaseReady = false;
let currentUsername = localStorage.getItem('chat_username') || '';
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let messagesChannel = null;
let usersChannel = null;
let heartbeatInterval = null;
let mediaViewer = null;
let viewerImage = null;
let viewerVideo = null;

// Ждем загрузки Supabase и инициализируем
function initSupabase() {
    return new Promise((resolve) => {
        function check() {
            if (window.supabase && window.supabase.createClient) {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                isSupabaseReady = true;
                console.log('Supabase инициализирован');
                resolve();
            } else {
                setTimeout(check, 100);
            }
        }
        check();
    });
}

// DOM элементы
let loginScreen, chatScreen, usernameInput, enterChatBtn, logoutBtn;
let messagesContainer, messageInput, sendBtn, attachBtn, imageBtn, videoBtn;
let voiceBtn, filePreview, fileNameEl, clearFileBtn, voiceModal;
let stopRecordBtn, cancelRecordBtn, recordingTimeEl, onlineCount;

// Ждем DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Находим элементы
    loginScreen = document.getElementById('loginScreen');
    chatScreen = document.getElementById('chatScreen');
    usernameInput = document.getElementById('usernameInput');
    enterChatBtn = document.getElementById('enterChatBtn');
    logoutBtn = document.getElementById('logoutBtn');
    messagesContainer = document.getElementById('messagesContainer');
    messageInput = document.getElementById('messageInput');
    sendBtn = document.getElementById('sendBtn');
    attachBtn = document.getElementById('attachBtn');
    imageBtn = document.getElementById('imageBtn');
    videoBtn = document.getElementById('videoBtn');
    voiceBtn = document.getElementById('voiceBtn');
    filePreview = document.getElementById('filePreview');
    fileNameEl = document.getElementById('fileName');
    clearFileBtn = document.getElementById('clearFileBtn');
    voiceModal = document.getElementById('voiceModal');
    stopRecordBtn = document.getElementById('stopRecordBtn');
    cancelRecordBtn = document.getElementById('cancelRecordBtn');
    recordingTimeEl = document.getElementById('recordingTime');
    onlineCount = document.getElementById('onlineCount');
    mediaViewer = document.getElementById('mediaViewer');
    viewerImage = document.getElementById('viewerImage');
    viewerVideo = document.getElementById('viewerVideo');
    
    // Инициализируем Supabase
    await initSupabase();
    
    // Восстанавливаем сессию
    if (currentUsername) {
        usernameInput.value = currentUsername;
    }
    
    setupEventListeners();
    
    // Event delegation для медиа
    messagesContainer.addEventListener('click', function(e) {
        const media = e.target.closest('.chat-media');
        if (media) {
            const url = media.dataset.url;
            const type = media.dataset.type;
            if (url && type) {
                openMedia(url, type);
            }
        }
    });
});

function setupEventListeners() {
    enterChatBtn.addEventListener('click', enterChat);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') enterChat();
    });
    
    // Медиа вьювер
    mediaViewer = document.getElementById('mediaViewer');
    viewerImage = document.getElementById('viewerImage');
    viewerVideo = document.getElementById('viewerVideo');
    
    if (mediaViewer) {
        mediaViewer.addEventListener('click', function(e) {
            if (e.target === mediaViewer || e.target.classList.contains('media-viewer-close')) {
                closeMedia();
            }
        });
    }
    
    // Кнопка выхода
    logoutBtn.addEventListener('click', logout);
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Файлы
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*,audio/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    imageInput.style.display = 'none';
    document.body.appendChild(imageInput);
    
    const videoInput = document.createElement('input');
    videoInput.type = 'file';
    videoInput.accept = 'video/*';
    videoInput.style.display = 'none';
    document.body.appendChild(videoInput);
    
    attachBtn.addEventListener('click', () => fileInput.click());
    imageBtn.addEventListener('click', () => imageInput.click());
    videoBtn.addEventListener('click', () => videoInput.click());
    
    fileInput.addEventListener('change', handleFileSelect);
    imageInput.addEventListener('change', handleFileSelect);
    videoInput.addEventListener('change', handleFileSelect);
    
    clearFileBtn.addEventListener('click', clearSelectedFile);
    
    voiceBtn.addEventListener('click', toggleVoiceRecording);
    stopRecordBtn.addEventListener('click', stopVoiceRecording);
    cancelRecordBtn.addEventListener('click', cancelVoiceRecording);
    
    voiceModal.addEventListener('click', (e) => {
        if (e.target === voiceModal) cancelVoiceRecording();
    });
    
    window.addEventListener('beforeunload', () => {
        if (currentUsername) leaveChat();
    });
    
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && currentUsername) {
            updatePresence(false);
        } else if (document.visibilityState === 'visible' && currentUsername) {
            updatePresence(true);
        }
    });
    
    // Escape key to close media viewer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMedia();
    });
    
    // Event delegation for clickable media
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('clickable-media')) {
            var src = e.target.dataset.src;
            var type = e.target.dataset.type;
            openMedia(src, type);
        }
    });
}

async function enterChat() {
    if (!isSupabaseReady || !supabase) {
        alert('Подождите, идет загрузка...');
        return;
    }
    
    const username = usernameInput.value.trim();
    
    if (!username) {
        alert('Введите никнейм');
        usernameInput.focus();
        return;
    }
    
    if (username.length < 2) {
        alert('Минимум 2 символа');
        return;
    }
    
    currentUsername = username;
    localStorage.setItem('chat_username', username);
    
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    
    await joinChat();
    loadMessages();
}

async function joinChat() {
    const sessionId = localStorage.getItem('session_id') || generateSessionId();
    localStorage.setItem('session_id', sessionId);
    
    // Пробуем добавить пользователя
    try {
        const { error } = await supabase
            .from('users')
            .upsert({
                id: sessionId,
                username: currentUsername,
                online: true,
                last_seen: new Date().toISOString()
            }, { onConflict: 'id', ignoreDuplicates: true });
        
        if (error && error.code !== '23505') {
            console.error('Ошибка присоединения:', error);
        }
    } catch (e) {
        console.error('Ошибка:', e);
    }
    
    // Realtime
    messagesChannel = supabase
        .channel('messages-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                displayMessage(payload.new);
                scrollToBottom();
            }
        )
        .subscribe();
    
    usersChannel = supabase
        .channel('users-channel')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'users' },
            () => updateOnlineCount()
        )
        .subscribe();
    
    heartbeatInterval = setInterval(() => updatePresence(true), 15000);
    updateOnlineCount();
}

async function updatePresence(online) {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId || !supabase) return;
    
    try {
        await supabase
            .from('users')
            .update({ online: online, last_seen: new Date().toISOString() })
            .eq('id', sessionId);
    } catch (e) {}
}

async function leaveChat() {
    await updatePresence(false);
    
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (messagesChannel) supabase.removeChannel(messagesChannel);
    if (usersChannel) supabase.removeChannel(usersChannel);
}

async function logout() {
    await leaveChat();
    
    currentUsername = '';
    localStorage.removeItem('chat_username');
    localStorage.removeItem('session_id');
    
    chatScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    usernameInput.value = '';
    usernameInput.focus();
    messagesContainer.innerHTML = '';
}

function generateSessionId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

async function updateOnlineCount() {
    if (!supabase) return;
    
    try {
        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('online', true);
        
        if (count !== null) {
            onlineCount.querySelector('span').textContent = count;
        }
    } catch (e) {}
}

async function loadMessages() {
    if (!supabase) return;
    
    try {
        const { data } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (data) {
            data.forEach(message => displayMessage(message));
            scrollToBottom();
        }
    } catch (e) {
        console.error('Ошибка загрузки:', e);
    }
}

async function sendMessage() {
    if (!supabase) return;
    
    const text = messageInput.value.trim();
    if (!text && !selectedFile) return;
    
    if (selectedFile) {
        await uploadFileAndSendMessage(text);
    } else {
        await sendTextMessage(text);
    }
    
    messageInput.value = '';
    clearSelectedFile();
}

async function sendTextMessage(text) {
    if (!supabase) return;
    
    const sessionId = localStorage.getItem('session_id');
    
    try {
        await supabase
            .from('messages')
            .insert({
                user_id: sessionId,
                username: currentUsername,
                content: text,
                message_type: 'text'
            });
    } catch (e) {
        console.error('Ошибка:', e);
        alert('Не удалось отправить');
    }
}

let selectedFile = null;
let selectedFileType = null;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    selectedFile = file;
    selectedFileType = file.type.split('/')[0];
    fileNameEl.textContent = file.name;
    filePreview.classList.remove('hidden');
    event.target.value = '';
}

function clearSelectedFile() {
    selectedFile = null;
    selectedFileType = null;
    filePreview.classList.add('hidden');
    fileNameEl.textContent = '';
}

async function uploadFileAndSendMessage(text) {
    if (!selectedFile || !supabase) return;
    
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
    
    try {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `files/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(filePath, selectedFile);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
            .from('chat-files')
            .getPublicUrl(filePath);
        
        const sessionId = localStorage.getItem('session_id');
        
        await supabase
            .from('messages')
            .insert({
                user_id: sessionId,
                username: currentUsername,
                content: text,
                file_url: urlData.publicUrl,
                file_type: selectedFile.type,
                file_name: selectedFile.name,
                message_type: selectedFileType
            });
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        alert('Не удалось загрузить файл');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22,2 15,22 11,13 2,9"/></svg>';
        clearSelectedFile();
    }
}

function displayMessage(message) {
    const el = document.createElement('div');
    el.className = 'message';
    
    const sessionId = localStorage.getItem('session_id');
    if (message.user_id === sessionId) el.classList.add('own');
    
    const time = new Date(message.created_at);
    const timeString = time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    let contentHtml = '';
    
    switch (message.message_type) {
        case 'text':
            contentHtml = `<div class="message-content">${escapeHtml(message.content)}</div>`;
            break;
        case 'image':
            contentHtml = `${message.content ? `<div class="message-content">${escapeHtml(message.content)}</div>` : ''}<div class="message-media"><img src="${message.file_url}" alt="" class="clickable-media" data-src="${message.file_url}" data-type="image"></div>`;
            break;
        case 'video':
            contentHtml = `${message.content ? `<div class="message-content">${escapeHtml(message.content)}</div>` : ''}<div class="message-media"><video controls src="${message.file_url}" class="clickable-media" data-src="${message.file_url}" data-type="video"></video></div>`;
            break;
        case 'audio':
            contentHtml = `<div class="message-content">${message.content ? escapeHtml(message.content) : 'Голосовое'}</div><div class="message-media"><audio controls src="${message.file_url}"></audio></div>`;
            break;
        default:
            contentHtml = `<div class="message-content">${escapeHtml(message.content || '')}</div>`;
    }
    
    el.innerHTML = `
        <div class="message-header">
            <span class="message-author">${escapeHtml(message.username)}</span>
            <span class="message-time">${timeString}</span>
        </div>
        ${contentHtml}`;
    
    messagesContainer.appendChild(el);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Голосовые
function toggleVoiceRecording() {
    if (!isRecording) startVoiceRecording();
    else stopVoiceRecording();
}

function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('Браузер не поддерживает запись');
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            isRecording = true;
            voiceBtn.classList.add('active');
            voiceModal.classList.add('active');
            
            recordingStartTime = Date.now();
            recordingTimer = setInterval(updateRecordingTime, 1000);
            updateRecordingTime();
            
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const fileName = `voice_${Date.now()}.webm`;
                const filePath = `files/${fileName}`;
                
                if (supabase) {
                    await supabase.storage
                        .from('chat-files')
                        .upload(filePath, audioBlob, { contentType: 'audio/webm' });
                    
                    const { data: urlData } = supabase.storage
                        .from('chat-files')
                        .getPublicUrl(filePath);
                    
                    const sessionId = localStorage.getItem('session_id');
                    
                    await supabase
                        .from('messages')
                        .insert({
                            user_id: sessionId,
                            username: currentUsername,
                            content: 'Голосовое сообщение',
                            file_url: urlData.publicUrl,
                            file_type: 'audio/webm',
                            file_name: fileName,
                            message_type: 'audio'
                        });
                }
                
                stream.getTracks().forEach(t => t.stop());
            };
            
            mediaRecorder.start();
        })
        .catch(err => {
            console.error(err);
            alert('Нет доступа к микрофону');
        });
}

function updateRecordingTime() {
    if (!recordingStartTime) return;
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    recordingTimeEl.textContent = `${m}:${s}`;
}

function stopVoiceRecording() {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;
    voiceBtn.classList.remove('active');
    voiceModal.classList.remove('active');
    clearInterval(recordingTimer);
    mediaRecorder.stop();
}

function cancelVoiceRecording() {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;
    voiceBtn.classList.remove('active');
    voiceModal.classList.remove('active');
    clearInterval(recordingTimer);
    mediaRecorder.stop();
    audioChunks = [];
}

function openMedia(url, type) {
    console.log('openMedia called:', url, type);
    var viewer = document.querySelector('#mediaViewer') || document.querySelector('.media-viewer');
    var img = document.querySelector('#viewerImage') || document.querySelector('.media-viewer img');
    var video = document.querySelector('#viewerVideo') || document.querySelector('.media-viewer video');
    
    console.log('viewer:', viewer, 'img:', img, 'video:', video);
    
    if (!viewer) {
        console.error('No viewer found');
        return;
    }
    
    if (type === 'image' && img) {
        img.src = url;
        img.style.display = 'block';
        if (video) video.style.display = 'none';
    } else if (type === 'video' && video) {
        video.src = url;
        video.style.display = 'block';
        if (img) img.style.display = 'none';
    }
    
    viewer.classList.add('active');
    viewer.style.display = 'flex';
    console.log('Viewer should be visible now');
}

function closeMedia() {
    var viewer = document.querySelector('#mediaViewer') || document.querySelector('.media-viewer');
    var video = document.querySelector('#viewerVideo') || document.querySelector('.media-viewer video');
    if (viewer) {
        viewer.classList.remove('active');
        viewer.style.display = 'none';
    }
    if (video) { 
        video.pause(); 
        video.src = ''; 
    }
}

window.openMedia = openMedia;
window.closeMedia = closeMedia;