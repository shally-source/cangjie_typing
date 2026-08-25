// 1. 題目資料庫：從 question_bank.js 自動載入
//    如果要重新產生題庫，請執行 generate_question_bank.py

// 2. 遊戲狀態變數
let selectedQuestions = [];
let currentQuestion = null;
let score = 0;
let correctCount = 0;
let wrongCount = 0;
let currentStudent = null;
let currentStudentClass = '';
let currentStudentId = '';
let countdownTimeLeft = 0;
let countdownTimerId = null;
let countdownDuration = 0;
let totalQuestions = 0;
let answeredCount = 0;
let challengeQuestions = [];
let audioContext = null;
let challengeCategories = [];
let challengeScoreSaved = false;
let currentCategory = '';

const API_URL = 'https://script.google.com/macros/s/AKfycbwAR-vfUwpy409Ghg816sG6hv8zyp6j1pbNI05JQT-5W_LqG_xyKn9VfF5Lp-Pj1apINw/exec';

const countdownSettings = {
    "哲理類": 123,
    "筆劃類": 156,
    "人身類": 87,
    "字型類": 159,
    "全部類別": 525
};

// 2. 學生登入資料（由附檔中的正式帳密資料載入）
const studentAccounts = window.studentAccounts || {};

let customAlertCallback = null;
let isTimerStarted = false;
let isChallengeActive = false;

window.addEventListener('beforeunload', (event) => {
    if (!isChallengeActive) {
        return;
    }

    event.preventDefault();
    event.returnValue = '';
});

function handleAnswerInput(event) {
    const input = event.target;
    if (!isTimerStarted && !document.getElementById('game-screen').classList.contains('hidden') && input.value.trim().length > 0) {
        isTimerStarted = true;
        startCountdownTimer();
    }
}

function ensureAudioContext() {
    if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioContext = new AudioContextClass();
        }
    }

    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    return audioContext;
}

function showCustomAlert(message, callback) {
    const dialog = document.getElementById('custom-alert');
    const messageElement = document.getElementById('custom-alert-message');

    if (!dialog || !messageElement) {
        alert(message);
        if (typeof callback === 'function') {
            callback();
        }
        return;
    }

    messageElement.textContent = message;
    customAlertCallback = typeof callback === 'function' ? callback : null;

    if (typeof dialog.showModal === 'function') {
        dialog.showModal();
    } else {
        alert(message);
        if (customAlertCallback) {
            customAlertCallback();
        }
    }
}

function closeCustomAlert() {
    const dialog = document.getElementById('custom-alert');
    if (dialog && dialog.open) {
        dialog.close();
    }
}

function confirmCustomAlert() {
    if (customAlertCallback) {
        const callback = customAlertCallback;
        customAlertCallback = null;
        closeCustomAlert();
        callback();
        return;
    }

    closeCustomAlert();
}

function goToMainMenu() {
    isTimerStarted = false;
    resetGameState();
    updateCategoryCheckboxState();
    showScreen('category-screen');
}

function saveScore(username, category, correctRate, timeUsed) {
    const accountRecord = studentAccounts[username];
    const scoreData = {
        studentClass: currentStudentClass,
        studentId: currentStudentId,
        name: getRealName(username),
        account: username,
        category,
        score: score,
        timeSpent: timeUsed
    };

    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(scoreData)
    }).catch(error => {
        console.error('排行榜成績儲存失敗：', error);
    });
}

async function getTopScores(category) {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API 回應錯誤：${response.status}`);
        const payload = await response.json();
        const records = Array.isArray(payload) ? payload : payload.data || payload.records || [];
        const filteredRecords = records
            .map(normalizeScoreRecord)
            .filter(record => category === 'all' || record.category === category);
        const bestByStudent = new Map();

        filteredRecords.forEach(record => {
            const key = `${record.account}::${record.category}`;
            const existing = bestByStudent.get(key);
            if (!existing || record.score > existing.score ||
                (record.score === existing.score && record.timeSpent < existing.timeSpent)) {
                bestByStudent.set(key, record);
            }
        });

        return Array.from(bestByStudent.values())
            .sort((first, second) => second.score - first.score || first.timeSpent - second.timeSpent)
            .slice(0, 100);
    } catch (error) {
        console.error('排行榜資料讀取失敗：', error);
        return [];
    }
}

function normalizeScoreRecord(record) {
    return {
        account: String(record.account || record.username || ''),
        category: String(record.category || ''),
        name: String(record.name || getRealName(record.account || record.username || '')),
        studentClass: String(record.studentClass || record.class || ''),
        score: Number(record.score ?? record.highestScore ?? 0),
        timeSpent: Number(record.timeSpent ?? record.timeUsed ?? record.bestTime ?? 0)
    };
}

function getRealName(username) {
    const accountRecord = studentAccounts[username];
    const name = accountRecord && typeof accountRecord === 'object' ? accountRecord.name : null;
    return name || username;
}

async function renderLeaderboard(category) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" class="leaderboard-empty">正在讀取排行榜...</td></tr>';
    const scores = await getTopScores(category);
    list.innerHTML = scores.length === 0
        ? '<tr><td colspan="5" class="leaderboard-empty">目前還沒有成績。</td></tr>'
        : scores.map((entry, index) => {
            return `
            <tr${entry.account === currentStudent ? ' class="current-student"' : ''}>
                <td>${index + 1}</td><td>${escapeHtml(entry.studentClass)}</td><td>${escapeHtml(entry.name)}</td>
                <td>${entry.score}</td><td>${entry.timeSpent} 秒</td>
            </tr>`;
        }).join('');
}

function switchLeaderboardCategory(category) {
    renderLeaderboard(category);
}

function openLeaderboard() {
    const dialog = document.getElementById('leaderboard-modal');
    document.getElementById('leaderboard-category').value = 'all';
    renderLeaderboard('all');
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
}

function closeLeaderboard() {
    const dialog = document.getElementById('leaderboard-modal');
    if (dialog && dialog.open) dialog.close();
}

function playTone({ frequency, duration, type = 'sine', volume = 0.08, startTime = 0, slideTo = null, attack = 0.01 }) {
    const context = ensureAudioContext();
    if (!context) {
        return;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    if (slideTo !== null) {
        oscillator.frequency.exponentialRampToValueAtTime(slideTo, startTime + duration);
    }

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(volume, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
}

function playCorrectSound() {
    const context = ensureAudioContext();
    if (!context) {
        return;
    }

    const now = context.currentTime;
    playTone({ frequency: 600, duration: 0.08, type: 'square', volume: 0.06, startTime: now, slideTo: 800 });
    playTone({ frequency: 760, duration: 0.08, type: 'square', volume: 0.05, startTime: now + 0.08, slideTo: 900 });
}

function playWrongSound() {
    const context = ensureAudioContext();
    if (!context) {
        return;
    }

    const now = context.currentTime;
    playTone({ frequency: 150, duration: 0.18, type: 'sawtooth', volume: 0.05, startTime: now });
}

function playTimeUpSound() {
    const context = ensureAudioContext();
    if (!context) {
        return;
    }

    const now = context.currentTime;
    [0, 0.18, 0.36].forEach((delay, index) => {
        playTone({ frequency: 440 + index * 80, duration: 0.12, type: 'square', volume: 0.06, startTime: now + delay });
    });
}

// 把所有題目合成一個大列表，方便隨機抽題
const allQuestions = [
    ...questionBank["哲理類"],
    ...questionBank["筆劃類"],
    ...questionBank["人身類"],
    ...questionBank["字型類"]
];

function updateStats() {
    document.getElementById("score").innerText = score;
    document.getElementById("correct-count").innerText = correctCount;
    document.getElementById("wrong-count").innerText = wrongCount;
    const countdownElement = document.getElementById("countdown-timer");
    if (countdownElement) {
        countdownElement.innerText = countdownTimeLeft;
    }
}

function updateProgress() {
    document.getElementById("completed-count").innerText = answeredCount;
    document.getElementById("total-count").innerText = totalQuestions;
}

function startCountdownTimer() {
    if (countdownTimerId !== null) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
    }
    isTimerStarted = true;
    countdownTimeLeft = countdownDuration;
    updateStats();
    countdownTimerId = setInterval(() => {
        countdownTimeLeft -= 1;
        if (countdownTimeLeft <= 0) {
            countdownTimeLeft = 0;
            updateStats();
            handleCountdownExpired();
        } else {
            updateStats();
        }
    }, 1000);
}

function stopCountdownTimer() {
    if (countdownTimerId !== null) {
        clearInterval(countdownTimerId);
        countdownTimerId = null;
    }
}

function resetGameState() {
    isChallengeActive = false;
    selectedQuestions = [];
    challengeQuestions = [];
    currentQuestion = null;
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    countdownTimeLeft = 0;
    countdownDuration = 0;
    totalQuestions = 0;
    answeredCount = 0;
    challengeCategories = [];
    currentCategory = '';
    challengeScoreSaved = false;
    stopCountdownTimer();
    updateStats();
    updateProgress();
    document.getElementById("answer-feedback").textContent = "";
    document.getElementById("answer-feedback").classList.remove("feedback-wrong");
    document.getElementById("mistake-mark").style.display = "none";
    document.getElementById("result-summary").classList.add("hidden");
    document.getElementById("answer-input").disabled = false;
    document.getElementById("answer-input").value = "";
}

function getSelectedCategories() {
    const allCategoryCheckbox = document.getElementById('cat-all');
    if (allCategoryCheckbox?.checked) {
        return ['全部類別'];
    }

    return Array.from(document.querySelectorAll('#category-screen input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value)
        .filter(value => value && questionBank[value]);
}

function updateCategoryCheckboxState() {
    const allCategoryCheckbox = document.getElementById('cat-all');
    if (!allCategoryCheckbox) return;

    document.querySelectorAll('#category-screen input[type="checkbox"]:not(#cat-all)')
        .forEach(checkbox => {
            checkbox.disabled = allCategoryCheckbox.checked;
            if (allCategoryCheckbox.checked) {
                checkbox.checked = false;
            }
        });
}

function populateSelectedQuestions() {
    const categories = getSelectedCategories();
    if (categories.length === 0) {
        showCustomAlert('請至少勾選一個分類後再開始練習。');
        return false;
    }

    selectedQuestions = categories[0] === '全部類別'
        ? allQuestions.map(question => ({ ...question, category: '全部類別' }))
        : categories.flatMap(category =>
            (questionBank[category] || []).map(question => ({ ...question, category }))
        );
    challengeQuestions = [...selectedQuestions];
    totalQuestions = selectedQuestions.length;
    answeredCount = 0;
    updateProgress();
    return selectedQuestions.length > 0;
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');

    if (screenId !== 'game-screen') {
        stopCountdownTimer();
    }
}

function loginStudent() {
    const account = document.getElementById("student-account").value.trim();
    const password = document.getElementById("student-password").value.trim();
    const loginMessage = document.getElementById("login-message");

    if (!account || !password) {
        loginMessage.textContent = "請輸入帳號與密碼。";
        return;
    }

    const accountRecord = studentAccounts[account];
    const storedPassword = accountRecord && typeof accountRecord === 'object'
        ? accountRecord.password
        : accountRecord;

    if (storedPassword === password) {
        currentStudent = account;
        currentStudentClass = accountRecord?.studentClass || accountRecord?.class || '';
        currentStudentId = accountRecord?.studentId || accountRecord?.id || '';
        document.getElementById("display-user").textContent = getRealName(currentStudent);
        loginMessage.textContent = "登入成功！";
        showScreen("category-screen");
        document.getElementById("student-password").value = "";
    } else {
        loginMessage.textContent = "帳號或密碼錯誤，請重新輸入。";
    }
}

function nextQuestion() {
    if (selectedQuestions.length === 0) {
        endGame();
        return;
    }

    const randomIndex = Math.floor(Math.random() * selectedQuestions.length);
    currentQuestion = selectedQuestions.splice(randomIndex, 1)[0];
    const feedbackElement = document.getElementById("answer-feedback");
    const questionImage = document.getElementById("question-img");
    feedbackElement.textContent = "";
    feedbackElement.classList.remove("feedback-wrong");
    document.getElementById("mistake-mark").style.display = "none";
    questionImage.style.display = "none";
    questionImage.removeAttribute("src");
    if (typeof currentQuestion.img === "string" && currentQuestion.img.trim()) {
        const imagePath = currentQuestion.img.trim().replace(/\\/g, "/").replace(/^\/+/, "");
        questionImage.src = encodeURI(`./${imagePath}`);
    }
    document.getElementById("answer-input").value = "";
    document.getElementById("answer-input").focus();
}

function showCompletionMessage(message) {
    stopCountdownTimer();
    updateStats();
    updateProgress();

    window.setTimeout(() => {
        showCustomAlert(message, goToMainMenu);
    }, 150);
}

function finishChallenge() {
    isChallengeActive = false;
    saveChallengeScores();
    if (correctCount === totalQuestions) {
        showCompletionMessage("恭喜你！挑戰成功 😊");
    } else {
        showCompletionMessage(`正確 ${correctCount} 個，錯誤 ${wrongCount} 個，再繼續加油 💪`);
    }
}

function saveChallengeScores() {
    if (challengeScoreSaved || !currentStudent) return;
    const timeUsed = Math.max(0, countdownDuration - countdownTimeLeft);
    challengeCategories.forEach(category => {
        currentCategory = category;
        const categoryQuestions = challengeQuestions.filter(question => question.category === category);
        const categoryCorrect = categoryQuestions.length > 0
            ? categoryQuestions.filter(question => question.answerWasCorrect).length
            : 0;
        const correctRate = categoryQuestions.length === 0 ? 0 : (categoryCorrect / categoryQuestions.length) * 100;
        saveScore(currentStudent, currentCategory, correctRate, timeUsed);
    });
    challengeScoreSaved = true;
}

function checkAnswer() {
    const answerInput = document.getElementById("answer-input");
    if (!currentQuestion || answerInput.disabled) {
        return;
    }

    const studentAnswer = answerInput.value.trim().toUpperCase();
    const feedbackElement = document.getElementById("answer-feedback");
    let answerWasWrong = false;

    if (studentAnswer === currentQuestion.code) {
        score += 10;
        correctCount += 1;
        feedbackElement.textContent = "答對了！繼續加油。";
        feedbackElement.classList.remove("feedback-wrong");
        feedbackElement.style.color = "#2ecc71";
        playCorrectSound();
        currentQuestion.answerWasCorrect = true;
    } else {
        wrongCount += 1;
        feedbackElement.innerHTML = `答錯了！正確答案是：<span class="correct-highlight"></span>`;
        feedbackElement.querySelector(".correct-highlight").textContent = currentQuestion.code;
        feedbackElement.classList.add("feedback-wrong");
        feedbackElement.style.color = "#e74c3c";
        playWrongSound();
        currentQuestion.answerWasCorrect = false;
        answerWasWrong = true;
    }

    answeredCount += 1;
    updateStats();
    updateProgress();

    if (answerWasWrong) {
        answerInput.disabled = true;
        document.getElementById("mistake-mark").style.display = "block";
        window.setTimeout(() => {
            document.getElementById("mistake-mark").style.display = "none";
            feedbackElement.textContent = "";
            feedbackElement.classList.remove("feedback-wrong");
            answerInput.disabled = false;
            if (answeredCount >= totalQuestions) {
                finishChallenge();
                return;
            }
            nextQuestion();
        }, 2000);
        return;
    }

    if (answeredCount >= totalQuestions) {
        finishChallenge();
        return;
    }

    nextQuestion();
}

function handleKeydown(event) {
    if (event.code === 'Space' && !document.getElementById('game-screen').classList.contains('hidden')) {
        event.preventDefault();
        checkAnswer();
    }
}

function getSelectedCountdownDuration() {
    const categories = getSelectedCategories();
    return categories.reduce((total, category) => total + (countdownSettings[category] || 0), 0);
}

function startGame() {
    if (!currentStudent) {
        showScreen("login-screen");
        return;
    }

    if (!populateSelectedQuestions()) {
        return;
    }

    const selectedCategoryNames = getSelectedCategories();
    challengeCategories = selectedCategoryNames;
    currentCategory = selectedCategoryNames[0] || '';
    document.getElementById("current-category-name").textContent = selectedCategoryNames.length > 0
        ? `🎯 當前挑戰：${selectedCategoryNames.join('、')}`
        : "";

    score = 0;
    correctCount = 0;
    wrongCount = 0;
    answeredCount = 0;
    isTimerStarted = false;
    countdownDuration = getSelectedCountdownDuration();
    document.getElementById("answer-feedback").textContent = "";
    document.getElementById("result-summary").classList.add("hidden");
    document.getElementById("answer-input").disabled = false;
    isChallengeActive = true;
    updateStats();
    updateProgress();

    showScreen("game-screen");
    nextQuestion();
}

function restartGame() {
    document.getElementById("current-category-name").textContent = "";
    isTimerStarted = false;
    resetGameState();
    showScreen("category-screen");
}

function endGame() {
    isChallengeActive = false;
    stopCountdownTimer();
    document.getElementById("result-summary").textContent = `練習完成！總共 ${totalQuestions} 題，答對 ${correctCount} 題，答錯 ${wrongCount} 題，總得分 ${score} 分。`;
    document.getElementById("result-summary").classList.remove("hidden");
    document.getElementById("answer-input").disabled = true;
}

function handleCountdownExpired() {
    isChallengeActive = false;
    countdownTimeLeft = 0;
    updateStats();
    updateProgress();
    playTimeUpSound();
    saveChallengeScores();
    showCompletionMessage(`正確 ${correctCount} 個，錯誤 ${wrongCount} 個，再繼續加油 💪`);
}

window.onload = function() {
    resetGameState();
    showScreen("login-screen");
    const questionImage = document.getElementById('question-img');
    if (questionImage) {
        questionImage.addEventListener('load', () => {
            questionImage.style.display = 'block';
        });
        questionImage.addEventListener('error', () => {
            questionImage.style.display = 'none';
            questionImage.removeAttribute('src');
        });
    }
    const allCategoryCheckbox = document.getElementById('cat-all');
    if (allCategoryCheckbox) {
        allCategoryCheckbox.addEventListener('change', updateCategoryCheckboxState);
    }
    updateCategoryCheckboxState();
    document.addEventListener('keydown', handleKeydown);
    const answerInput = document.getElementById('answer-input');
    if (answerInput) {
        answerInput.addEventListener('input', handleAnswerInput);
    }
};