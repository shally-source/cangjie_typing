// 1. 題目資料庫：從 question_bank.js 自動載入
//    如果要重新產生題庫，請執行 generate_question_bank.py

// 2. 遊戲狀態變數
let selectedQuestions = [];
let currentQuestion = null;
let score = 0;
let correctCount = 0;
let wrongCount = 0;
let currentStudent = null;
let countdownTimeLeft = 0;
let countdownTimerId = null;
let countdownDuration = 0;
let totalQuestions = 0;
let answeredCount = 0;
let audioContext = null;

const countdownSettings = {
    "哲理類": 123,
    "筆劃類": 156,
    "人身類": 87,
    "字型類": 159
};

// 2. 學生登入資料（由附檔中的正式帳密資料載入）
const studentAccounts = window.studentAccounts || {};

let customAlertCallback = null;
let isTimerStarted = false;

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
    showScreen('category-screen');
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
    selectedQuestions = [];
    currentQuestion = null;
    score = 0;
    correctCount = 0;
    wrongCount = 0;
    countdownTimeLeft = 0;
    countdownDuration = 0;
    totalQuestions = 0;
    answeredCount = 0;
    stopCountdownTimer();
    updateStats();
    updateProgress();
    document.getElementById("answer-feedback").textContent = "";
    document.getElementById("result-summary").classList.add("hidden");
    document.getElementById("answer-input").disabled = false;
    document.getElementById("answer-input").value = "";
}

function getSelectedCategories() {
    return Array.from(document.querySelectorAll('#category-screen input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value)
        .filter(value => value && questionBank[value]);
}

function populateSelectedQuestions() {
    const categories = getSelectedCategories();
    if (categories.length === 0) {
        showCustomAlert('請至少勾選一個分類後再開始練習。');
        return false;
    }

    selectedQuestions = categories.flatMap(category => questionBank[category] || []);
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

    if (studentAccounts[account] === password) {
        currentStudent = account;
        document.getElementById("display-user").textContent = currentStudent;
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
    document.getElementById("question-img").src = currentQuestion.img;
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
    if (correctCount === totalQuestions) {
        showCompletionMessage("恭喜你！挑戰成功 😊");
    } else {
        showCompletionMessage(`正確 ${correctCount} 個，錯誤 ${wrongCount} 個，再繼續加油 💪`);
    }
}

function checkAnswer() {
    if (!currentQuestion) {
        return;
    }

    const studentAnswer = document.getElementById("answer-input").value.trim().toUpperCase();
    const feedbackElement = document.getElementById("answer-feedback");

    if (studentAnswer === currentQuestion.code) {
        score += 10;
        correctCount += 1;
        feedbackElement.textContent = "答對了！繼續加油。";
        feedbackElement.style.color = "#2ecc71";
        playCorrectSound();
    } else {
        wrongCount += 1;
        feedbackElement.textContent = `答錯了，正確答案是：${currentQuestion.code}`;
        feedbackElement.style.color = "#e74c3c";
        playWrongSound();
    }

    answeredCount += 1;
    updateStats();
    updateProgress();

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
    stopCountdownTimer();
    document.getElementById("result-summary").textContent = `練習完成！總共 ${totalQuestions} 題，答對 ${correctCount} 題，答錯 ${wrongCount} 題，總得分 ${score} 分。`;
    document.getElementById("result-summary").classList.remove("hidden");
    document.getElementById("answer-input").disabled = true;
}

function handleCountdownExpired() {
    countdownTimeLeft = 0;
    updateStats();
    updateProgress();
    playTimeUpSound();
    showCompletionMessage(`正確 ${correctCount} 個，錯誤 ${wrongCount} 個，再繼續加油 💪`);
}

window.onload = function() {
    resetGameState();
    showScreen("login-screen");
    document.addEventListener('keydown', handleKeydown);
    const answerInput = document.getElementById('answer-input');
    if (answerInput) {
        answerInput.addEventListener('input', handleAnswerInput);
    }
};