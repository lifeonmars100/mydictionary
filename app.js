document.addEventListener('DOMContentLoaded', () => {
    // ----- DOM 요소 (변경 없음) -----
    const views = { setup: document.getElementById('setup-view'), main: document.getElementById('main-view'), detail: document.getElementById('detail-view') };
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const searchBtn = document.getElementById('search-btn');
    const voiceSearchBtn = document.getElementById('voice-search-btn');
    const wordListContainer = document.getElementById('word-list-container');
    const backButton = document.getElementById('back-button');
    const flashcard = document.querySelector('.flashcard');
    const flashcardFront = document.getElementById('flashcard-front');
    const flashcardBack = document.getElementById('flashcard-back');
    const flashcardEng = document.getElementById('flashcard-eng');
    const flashcardKor = document.getElementById('flashcard-kor');
    const speakButton = document.getElementById('speak-button');
    const favoriteButton = document.getElementById('favorite-button');
    const settingsBtn = document.getElementById('settings-btn');
    const favoritesListBtn = document.getElementById('favorites-list-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const resetDataBtn = document.getElementById('reset-data-btn');
    const fileInput = document.getElementById('file-input');
    const setupStatus = document.getElementById('setup-status');
    const increaseFontBtn = document.getElementById('increase-font-btn');
    const decreaseFontBtn = document.getElementById('decrease-font-btn');
    const fontSizeDisplay = document.getElementById('font-size-display');
    const toast = document.getElementById('toast');
    const loadingOverlay = document.getElementById('loading-overlay');
    const wordCountDisplay = document.getElementById('word-count-display');
    
    // ----- 상태 변수 (변경 없음) -----
    let db;
    let currentWord = null;
    let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
    let currentFontSize = parseInt(localStorage.getItem('fontSize')) || 16;
    let isFavoritesView = false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // ----- 상수 (변경 없음) -----
    const DB_NAME = "MyDictionaryDB", STORE_NAME = "words", DB_VERSION = 2;

    // ----- 뷰 관리 (변경 없음) -----
    function showView(viewName) { Object.values(views).forEach(v => v.classList.add('hidden')); views[viewName].classList.remove('hidden'); }

    // ----- IndexedDB (DB 생성 및 업그레이드 로직 수정) -----
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = e => reject("DB 열기 오류: " + e.target.errorCode);
            request.onsuccess = e => { db = e.target.result; resolve(db); };
            
            // ★★★★★ 변경: DB 생성과 업그레이드를 모두 처리하는 완전한 로직 ★★★★★
            request.onupgradeneeded = e => {
                const db = e.target.result;
                let store;

                // 1. 저장소(store)가 없는 경우 -> 새로 생성 (최초 실행 시)
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                } 
                // 2. 저장소가 이미 있는 경우 -> 기존 저장소 가져오기 (버전 업그레이드 시)
                else {
                    store = e.target.transaction.objectStore(STORE_NAME);
                }

                // 3. 인덱스가 없는 경우 -> 새로 생성 (공통)
                if (!store.indexNames.contains('english_idx')) {
                    store.createIndex("english_idx", "english", { unique: false });
                }
                if (!store.indexNames.contains('korean_idx')) {
                    store.createIndex("korean_idx", "korean", { unique: false });
                }
            };
        });
    }

    // ----- 나머지 함수들은 모두 동일합니다 (변경 없음) -----
    function checkDBStatus() { return new Promise((resolve) => { if (!db) { resolve(false); return; } const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const countReq = store.count(); countReq.onsuccess = () => resolve(countReq.result > 0); countReq.onerror = () => resolve(false); }); }
    function importDataToDB(wordsData) { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); store.clear(); wordsData.forEach(word => store.add(word)); tx.oncomplete = () => resolve(); tx.onerror = e => reject("데이터 저장 오류: " + e.target.error); }); }
    function clearDB() { return new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); const store = tx.objectStore(STORE_NAME); const req = store.clear(); req.onsuccess = () => resolve(); req.onerror = e => reject("DB 초기화 오류: " + e.target.error); }); }
    function getWordCount() { return new Promise((resolve) => { if (!db) { resolve(0); return; } const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const countReq = store.count(); countReq.onsuccess = () => resolve(countReq.result); countReq.onerror = () => resolve(0); }); }
    function searchWords(term) {
        return new Promise((resolve) => {
            const searchTerm = term.trim().toLowerCase();
            if (!db || searchTerm.length === 0) { resolve([]); return; }
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const results = new Map();
            let queriesFinished = 0;
            const onQueryComplete = () => { queriesFinished++; if (queriesFinished === 2) { resolve(Array.from(results.values()).slice(0, 100)); } };
            const engIndex = store.index("english_idx");
            const engRange = IDBKeyRange.bound(searchTerm, searchTerm + '\uffff');
            engIndex.openCursor(engRange).onsuccess = e => { const cursor = e.target.result; if (cursor) { results.set(cursor.value.id, cursor.value); cursor.continue(); } else { onQueryComplete(); } };
            const korIndex = store.index("korean_idx");
            const korRange = IDBKeyRange.bound(term.trim(), term.trim() + '\uffff');
            korIndex.openCursor(korRange).onsuccess = e => { const cursor = e.target.result; if (cursor) { results.set(cursor.value.id, cursor.value); cursor.continue(); } else { onQueryComplete(); } };
        });
    }
    function getWordsByIds(ids) { return new Promise((resolve) => { if (!db || ids.length === 0) { resolve([]); return; } const tx = db.transaction(STORE_NAME, "readonly"); const store = tx.objectStore(STORE_NAME); const results = []; let processed = 0; ids.forEach(id => { const req = store.get(id); req.onsuccess = () => { if (req.result) results.push(req.result); processed++; if (processed === ids.length) resolve(results); }; }); }); }
    function displayWords(words) { wordListContainer.innerHTML = ''; if (words.length === 0) { wordListContainer.innerHTML = `<p class="placeholder">${isFavoritesView ? '즐겨찾기한 단어가 없습니다.' : '검색 결과가 없습니다.'}</p>`; return; } words.forEach(word => { const item = document.createElement('div'); item.className = 'word-item'; const summary = word.korean.length > 40 ? word.korean.substring(0, 40) + '...' : word.korean; item.innerHTML = `<span class="word-item-eng">${word.english}</span><span class="word-item-kor">${summary}</span>`; item.addEventListener('click', () => showDetailView(word)); wordListContainer.appendChild(item); }); }
    function showDetailView(word) { currentWord = word; flashcardEng.textContent = word.english; flashcardKor.textContent = word.korean; flashcard.classList.remove('flipped'); updateFavoriteButton(); showView('detail'); flashcardFront.scrollTop = 0; flashcardBack.scrollTop = 0; history.pushState({ view: 'detail' }, '', `#word`); }
    function updateFavoriteButton() { if (favorites.includes(currentWord.id)) { favoriteButton.classList.add('favorited'); favoriteButton.innerHTML = '<i class="fas fa-star"></i>'; } else { favoriteButton.classList.remove('favorited'); favoriteButton.innerHTML = '<i class="far fa-star"></i>'; } }
    function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 2000); }
    function applyFontSize() { document.documentElement.style.fontSize = `${currentFontSize}px`; fontSizeDisplay.textContent = `${currentFontSize}px`; localStorage.setItem('fontSize', currentFontSize); }
    async function performSearch() { if(isFavoritesView) { isFavoritesView = false; favoritesListBtn.classList.remove('active'); } const term = searchInput.value; const words = await searchWords(term); displayWords(words); }
    searchInput.addEventListener('input', () => clearSearchBtn.classList.toggle('hidden', searchInput.value.length === 0));
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSearch(); });
    clearSearchBtn.addEventListener('click', () => { searchInput.value = ''; clearSearchBtn.classList.add('hidden'); if(!isFavoritesView) wordListContainer.innerHTML = `<p class="placeholder">검색어를 입력하여 단어를 찾아보세요.</p>`; });
    searchBtn.addEventListener('click', performSearch);
    if (SpeechRecognition) { voiceSearchBtn.addEventListener('click', () => { const recognition = new SpeechRecognition(); recognition.lang = 'ko-KR'; recognition.onresult = (event) => { let transcript = event.results[0][0].transcript; if (transcript.endsWith('.')) { transcript = transcript.slice(0, -1); } searchInput.value = transcript; clearSearchBtn.classList.remove('hidden'); performSearch(); }; recognition.start(); }); } else { voiceSearchBtn.style.display = 'none'; }
    backButton.addEventListener('click', () => { history.back(); });
    flashcard.addEventListener('click', () => flashcard.classList.toggle('flipped'));
    speakButton.addEventListener('click', () => { if (currentWord && 'speechSynthesis' in window) { const utterance = new SpeechSynthesisUtterance(currentWord.english); utterance.lang = 'en-US'; window.speechSynthesis.speak(utterance); } });
    favoriteButton.addEventListener('click', () => { const wordId = currentWord.id; const index = favorites.indexOf(wordId); if (index > -1) { favorites.splice(index, 1); showToast('즐겨찾기에서 삭제되었습니다.'); } else { favorites.push(wordId); showToast('즐겨찾기에 추가되었습니다.'); } localStorage.setItem('favorites', JSON.stringify(favorites)); updateFavoriteButton(); });
    favoritesListBtn.addEventListener('click', async () => { isFavoritesView = !isFavoritesView; favoritesListBtn.classList.toggle('active', isFavoritesView); searchInput.value = ''; clearSearchBtn.classList.add('hidden'); if (isFavoritesView) { const favoriteWords = await getWordsByIds(favorites); displayWords(favoriteWords); } else { wordListContainer.innerHTML = `<p class="placeholder">검색어를 입력하여 단어를 찾아보세요.</p>`; } });
    settingsBtn.addEventListener('click', async () => { const count = await getWordCount(); wordCountDisplay.textContent = `${count.toLocaleString()}개 단어`; settingsModal.classList.remove('hidden'); });
    closeModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });
    resetDataBtn.addEventListener('click', async () => { if (confirm('정말로 모든 단어와 즐겨찾기 데이터를 삭제하시겠습니까?')) { try { await clearDB(); localStorage.clear(); showToast('모든 데이터가 초기화되었습니다.'); location.reload(); } catch (error) { alert(error); } } });
    increaseFontBtn.addEventListener('click', () => { currentFontSize = Math.min(45, currentFontSize + 1); applyFontSize(); });
    decreaseFontBtn.addEventListener('click', () => { currentFontSize = Math.max(12, currentFontSize - 1); applyFontSize(); });
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        loadingOverlay.classList.remove('hidden'); setupStatus.textContent = ''; const reader = new FileReader();
        reader.onload = async (e) => { try { const wordsData = JSON.parse(e.target.result); await importDataToDB(wordsData); setupStatus.textContent = '✅ 설정 완료!'; setTimeout(() => { location.reload(); }, 1500); } catch (err) { setupStatus.textContent = '오류: 올바른 JSON 파일이 아닙니다.'; alert("파일 처리 오류: " + err); loadingOverlay.classList.add('hidden'); } };
        reader.onerror = () => { setupStatus.textContent = '파일을 읽는 데 실패했습니다.'; loadingOverlay.classList.add('hidden'); };
        reader.readAsText(file);
    });
    async function init() {
        applyFontSize();
        try {
            await openDB();
            const isDataReady = await checkDBStatus();
            if (isDataReady) { showView('main'); } else { showView('setup'); }
            history.replaceState({ view: 'main' }, '', location.pathname);
        } catch (error) {
            alert("앱 초기화 오류: " + error);
            document.body.innerHTML = "<h1>앱 로딩 실패</h1><p>앱 데이터를 초기화하고 다시 시도해주세요.</p>";
        }
    }
    window.addEventListener('popstate', async (event) => { if (!event.state || event.state.view === 'main') { showView('main'); if (isFavoritesView) { const favoriteWords = await getWordsByIds(favorites); displayWords(favoriteWords); } } });
    init();
});