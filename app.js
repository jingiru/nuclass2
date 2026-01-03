/* ========================================
   전역 변수
   ======================================== */
let classData = {};          // 반별 학생 데이터
let selectedStudents = [];   // 선택된 학생 목록
let history = [];            // 변경 이력
let changedStudents = new Set();  // 교환된 학생 표시용
let movedStudents = new Set();    // 이동된 학생 표시용

// 현재 로그인 정보
let currentSession = {
    schoolName: null,
    grade: null,
    isLoggedIn: false
};

// PDF.js 워커 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ========================================
   초기화
   ======================================== */
document.addEventListener('DOMContentLoaded', function() {
    // 저장된 세션 확인
    loadSession();
    
    // 자동완성 목록 로드
    loadAutocompleteList();
    
    // 이벤트 리스너 등록
    initEventListeners();
});

function initEventListeners() {
    // 로그인 폼
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // 로그아웃
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    
    // PDF 업로드
    document.getElementById('pdfUpload').addEventListener('change', handlePdfUpload);
    
    // 버튼들
    document.getElementById('globalSwapButton').addEventListener('click', swapStudents);
    document.getElementById('globalMoveButton').addEventListener('click', moveStudents);
    document.getElementById('sortByNameButton').addEventListener('click', sortByName);
    document.getElementById('resetDataButton').addEventListener('click', resetData);
    document.getElementById('downloadPdfButton').addEventListener('click', downloadPdf);
    document.getElementById('downloadExcelButton').addEventListener('click', downloadExcel);
    
    // 백업/복원
    document.getElementById('backupButton').addEventListener('click', backupToJson);
    document.getElementById('restoreButton').addEventListener('click', () => {
        alert('백업한 json파일을 업로드 해 주세요.');
        document.getElementById('jsonUpload').click();
    });
    document.getElementById('jsonUpload').addEventListener('change', restoreFromJson);

    // 드래그 앤 드롭 이벤트 (맨 끝에 추가)
    const dropZone = document.getElementById('dropZone');
    
    dropZone.addEventListener('dragenter', handleDragEnter);
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);    
}

/* ========================================
   화면 전환
   ======================================== */
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('dashboardScreen').style.display = 'none';
}

function showDashboardScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';
    
    // 학교 정보 표시
    document.getElementById('schoolInfoText').textContent = 
        `${currentSession.schoolName} - ${currentSession.grade}`;
}

/* ========================================
   세션 관리 (localStorage)
   ======================================== */
function loadSession() {
    const saved = localStorage.getItem('nuclass_session');
    if (saved) {
        currentSession = JSON.parse(saved);
        if (currentSession.isLoggedIn) {
            loadClassData();
            showDashboardScreen();
            return;
        }
    }
    showLoginScreen();
}

function saveSession() {
    localStorage.setItem('nuclass_session', JSON.stringify(currentSession));
}

function clearSession() {
    currentSession = {
        schoolName: null,
        grade: null,
        isLoggedIn: false
    };
    localStorage.removeItem('nuclass_session');
}

/* ========================================
   자동완성 목록 관리 (localStorage)
   ======================================== */
function loadAutocompleteList() {
    // 학교 이름 목록 로드
    const schoolNames = JSON.parse(localStorage.getItem('nuclass_schoolNames') || '[]');
    const schoolNameList = document.getElementById('schoolNameList');
    schoolNameList.innerHTML = '';
    schoolNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        schoolNameList.appendChild(option);
    });
    
    // 학년 목록 로드
    const grades = JSON.parse(localStorage.getItem('nuclass_grades') || '[]');
    const gradeList = document.getElementById('gradeList');
    gradeList.innerHTML = '';
    grades.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade;
        gradeList.appendChild(option);
    });
}

function saveAutocompleteList(schoolName, grade) {
    // 학교 이름 저장 (중복 제거, 최근 것이 위로)
    let schoolNames = JSON.parse(localStorage.getItem('nuclass_schoolNames') || '[]');
    schoolNames = schoolNames.filter(name => name !== schoolName);
    schoolNames.unshift(schoolName);
    schoolNames = schoolNames.slice(0, 10);  // 최대 10개 유지
    localStorage.setItem('nuclass_schoolNames', JSON.stringify(schoolNames));
    
    // 학년 저장 (중복 제거, 최근 것이 위로)
    let grades = JSON.parse(localStorage.getItem('nuclass_grades') || '[]');
    grades = grades.filter(g => g !== grade);
    grades.unshift(grade);
    grades = grades.slice(0, 10);  // 최대 10개 유지
    localStorage.setItem('nuclass_grades', JSON.stringify(grades));
    
    // datalist 갱신
    loadAutocompleteList();
}

/* ========================================
   로그인 처리
   ======================================== */
async function handleLogin(event) {
    event.preventDefault();
    
    const schoolName = document.getElementById('schoolNameInput').value.trim();
    const grade = document.getElementById('gradeInput').value.trim();
    const password = document.getElementById('passwordInput').value.trim();
    const messageDiv = document.getElementById('loginMessage');
    
    // 입력 검증
    if (!schoolName || !grade || !password) {
        messageDiv.textContent = '학교이름, 학년, 비밀번호를 모두 입력해주세요.';
        return;
    }
    
    if (!/^\d{5}$/.test(password)) {
        messageDiv.textContent = '비밀번호는 숫자 5자리여야 합니다.';
        return;
    }
    
    // 비밀번호 확인 (localStorage)
    // 학교이름과 학년을 조합해서 고유 키 생성
    const storageKey = `nuclass_pwd_${schoolName}_${grade}`;
    const savedPassword = localStorage.getItem(storageKey);
    
    if (savedPassword === null) {
        // 최초 로그인: 비밀번호 등록
        localStorage.setItem(storageKey, password);
        messageDiv.style.color = '#4CAF50';
        messageDiv.textContent = '비밀번호가 등록되었습니다!';
    } else if (savedPassword !== password) {
        // 비밀번호 불일치
        messageDiv.style.color = '#e53935';
        messageDiv.textContent = '비밀번호가 일치하지 않습니다.';
        return;
    }
    
    // 로그인 성공
    currentSession = {
        schoolName: schoolName,
        grade: grade,
        isLoggedIn: true
    };
    saveSession();
    saveAutocompleteList(schoolName, grade);  // 자동완성 목록에 저장
    loadClassData();
    showDashboardScreen();
}


function handleLogout() {
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    
    clearSession();
    classData = {};
    selectedStudents = [];
    history = [];
    changedStudents.clear();
    movedStudents.clear();
    
    // 입력 필드 초기화
    document.getElementById('schoolNameInput').value = '';
    document.getElementById('gradeInput').value = '';
    document.getElementById('passwordInput').value = '';
    document.getElementById('loginMessage').textContent = '';
    
    showLoginScreen();
}

/* ========================================
   데이터 저장/불러오기 (localStorage)
   ======================================== */
function getDataKey() {
    return `nuclass_data_${currentSession.schoolName}_${currentSession.grade}`;
}


function saveClassData() {
    const dataToSave = {
        classData: classData,
        history: history,
        changedStudents: Array.from(changedStudents),
        movedStudents: Array.from(movedStudents)
    };
    localStorage.setItem(getDataKey(), JSON.stringify(dataToSave));
}

function loadClassData() {
    const saved = localStorage.getItem(getDataKey());
    if (saved) {
        const parsed = JSON.parse(saved);
        classData = parsed.classData || {};
        history = parsed.history || [];
        changedStudents = new Set(parsed.changedStudents || []);
        movedStudents = new Set(parsed.movedStudents || []);
    } else {
        classData = {};
        history = [];
        changedStudents = new Set();
        movedStudents = new Set();
    }
    renderClasses();
    renderHistory();
}



/* ========================================
   드래그 앤 드롭 처리
   ======================================== */
function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').classList.add('drag-over');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // 자식 요소로 이동할 때는 drag-over 유지
    if (!e.currentTarget.contains(e.relatedTarget)) {
        document.getElementById('dropZone').classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('dropZone').classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    const file = files[0];
    
    // PDF 파일인지 확인
    if (file.type !== 'application/pdf') {
        alert('PDF 파일만 업로드 가능합니다.');
        return;
    }
    
    // 기존 PDF 처리 함수 호출
    processPdfFile(file);
}




/* ========================================
   PDF 파싱 (PDF.js)
   ======================================== */
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
        alert('PDF 파일만 업로드 가능합니다.');
        return;
    }

    processPdfFile(file);

    // 파일 입력 초기화 (같은 파일 다시 선택 가능하도록)
    event.target.value = '';
}
    
async function processPdfFile(file) {
    // 로딩 표시
    const container = document.getElementById('classesContainer');
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>PDF 파일을 분석 중입니다...</p>
        </div>
    `;
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let allText = '';
        
        // 모든 페이지에서 텍스트 추출
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            allText += pageText + '\n';
        }
        
        // 텍스트 파싱하여 학생 데이터 추출
        classData = parsePdfText(allText);
        history = [];
        changedStudents.clear();
        movedStudents.clear();
        
        saveClassData();
        renderClasses();
        renderHistory();
        
        alert('PDF 업로드 및 분석이 완료되었습니다!');
        
    } catch (error) {
        console.error('PDF 파싱 오류:', error);
        alert('PDF 파일 처리 중 오류가 발생했습니다.');
        renderClasses();
    }
}

function parsePdfText(text) {
    const classes = {};
    
    // 패턴 1: 일반 학생 (이전학적이 숫자로 된 경우)
    // 예: 3 1 1 따뜻이 2011.07.23 여 634.17 2 5 28
    const normalPattern = /(\d)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d{4}\.\d{2}\.\d{2})\s+(남|여)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)/g;
    
    // 패턴 2: 전입생 (이전학적이 "전입"인 경우)
    // 예: 2 1 29 하늘이 2012.02.10 여 984.01 전입
    const transferPattern = /(\d)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d{4}\.\d{2}\.\d{2})\s+(남|여)\s+([\d.]+)\s+전입/g;
    
    let match;
    
    // 일반 학생 파싱
    while ((match = normalPattern.exec(text)) !== null) {
        const [
            _,           // 전체 매치
            grade,       // 학년
            classNum,    // 반
            number,      // 번호
            name,        // 성명
            birthDate,   // 생년월일
            gender,      // 성별
            score,       // 기준성적
            prevGrade,   // 이전학년
            prevClass,   // 이전반
            prevNumber   // 이전번호
        ] = match;
        
        const classKey = `${grade}-${classNum}`;
        
        if (!classes[classKey]) {
            classes[classKey] = [];
        }
        
        classes[classKey].push({
            번호: number,
            성명: name,
            생년월일: birthDate,
            성별: gender,
            기준성적: score,
            이전학적: `${prevGrade} ${prevClass} ${prevNumber}`,
            이전학적학년: prevGrade,
            이전학적반: prevClass,
            이전학적번호: prevNumber
        });
    }
    
    // 전입생 파싱
    while ((match = transferPattern.exec(text)) !== null) {
        const [
            _,           // 전체 매치
            grade,       // 학년
            classNum,    // 반
            number,      // 번호
            name,        // 성명
            birthDate,   // 생년월일
            gender,      // 성별
            score        // 기준성적
        ] = match;
        
        const classKey = `${grade}-${classNum}`;
        
        if (!classes[classKey]) {
            classes[classKey] = [];
        }
        
        classes[classKey].push({
            번호: number,
            성명: name,
            생년월일: birthDate,
            성별: gender,
            기준성적: score,
            이전학적: '전입',
            이전학적학년: grade,    // 현재 학년으로 설정
            이전학적반: '0',        // 0으로 설정
            이전학적번호: '0'       // 0으로 설정
        });
    }
    
    return classes;
}function parsePdfText(text) {
    const classes = {};
    
    // 패턴 1: 일반 학생 (이전학적이 숫자로 된 경우)
    // 예: 3 1 1 따뜻이 2011.07.23 여 634.17 2 5 28
    const normalPattern = /(\d)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d{4}\.\d{2}\.\d{2})\s+(남|여)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)/g;
    
    // 패턴 2: 전입생 (이전학적이 "전입"인 경우)
    // 예: 2 1 29 하늘이 2012.02.10 여 984.01 전입
    const transferPattern = /(\d)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d{4}\.\d{2}\.\d{2})\s+(남|여)\s+([\d.]+)\s+전입/g;
    
    let match;
    
    // 일반 학생 파싱
    while ((match = normalPattern.exec(text)) !== null) {
        const [
            _,           // 전체 매치
            grade,       // 학년
            classNum,    // 반
            number,      // 번호
            name,        // 성명
            birthDate,   // 생년월일
            gender,      // 성별
            score,       // 기준성적
            prevGrade,   // 이전학년
            prevClass,   // 이전반
            prevNumber   // 이전번호
        ] = match;
        
        const classKey = `${grade}-${classNum}`;
        
        if (!classes[classKey]) {
            classes[classKey] = [];
        }
        
        classes[classKey].push({
            번호: number,
            성명: name,
            생년월일: birthDate,
            성별: gender,
            기준성적: score,
            이전학적: `${prevGrade} ${prevClass} ${prevNumber}`,
            이전학적학년: prevGrade,
            이전학적반: prevClass,
            이전학적번호: prevNumber
        });
    }
    
    // 전입생 파싱
    while ((match = transferPattern.exec(text)) !== null) {
        const [
            _,           // 전체 매치
            grade,       // 학년
            classNum,    // 반
            number,      // 번호
            name,        // 성명
            birthDate,   // 생년월일
            gender,      // 성별
            score        // 기준성적
        ] = match;
        
        const classKey = `${grade}-${classNum}`;
        
        if (!classes[classKey]) {
            classes[classKey] = [];
        }
        
        classes[classKey].push({
            번호: number,
            성명: name,
            생년월일: birthDate,
            성별: gender,
            기준성적: score,
            이전학적: '전입',
            이전학적학년: String(parseInt(grade) - 1),    // 현재 학년으로 설정
            이전학적반: '0',        // 0으로 설정
            이전학적번호: '0'       // 0으로 설정
        });
    }
    
    return classes;
}

/* ========================================
   렌더링: 반 목록
   ======================================== */
function renderClasses() {
    const container = document.getElementById('classesContainer');
    container.innerHTML = '';
    
    const validClasses = Object.keys(classData).filter(
        cls => cls !== 'history' && cls !== 'undefined'
    );
    
    // 데이터 유무에 따라 버튼 활성화/비활성화
    const hasData = validClasses.length > 0;
    document.getElementById('sortByNameButton').disabled = !hasData;
    document.getElementById('downloadPdfButton').disabled = !hasData;
    document.getElementById('downloadExcelButton').disabled = !hasData;
    document.getElementById('backupButton').disabled = !hasData;
    document.getElementById('resetDataButton').disabled = !hasData;
    
    if (validClasses.length === 0) {
        container.innerHTML = `
            <div class="empty-message" style="grid-column: 1 / -1;">
                <div class="icon">📄</div>
                <p>데이터가 없습니다.</p>
                <p>PDF 파일을 업로드해주세요.</p>
                <p>(여기에 파일 드래그&드롭 가능)</p>
            </div>
        `;
        renderStatistics();
        return;
    }
    
    // 반 정렬 (학년-반 순)
    validClasses.sort((a, b) => {
        const [gradeA, classA] = a.split('-').map(Number);
        const [gradeB, classB] = b.split('-').map(Number);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    });
    
    validClasses.forEach(cls => {
        const [grade, classNumber] = cls.split('-');
        const students = classData[cls];
        
        const classBox = document.createElement('div');
        classBox.className = 'class-box';
        
        // 반 제목
        const title = document.createElement('h3');
        title.textContent = `${classNumber}반`;
        classBox.appendChild(title);
        
        // 학생 테이블
        const table = document.createElement('table');
        table.className = 'student-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th rowspan="2">번호</th>
                    <th rowspan="2">성명</th>
                    <th rowspan="2">생년월일</th>
                    <th rowspan="2">성별</th>
                    <th rowspan="2">기준성적</th>
                    <th colspan="3">이전학적</th>
                </tr>
                <tr>
                    <th style="width: 40px;">학년</th>
                    <th style="width: 40px;">반</th>
                    <th style="width: 40px;">번호</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        
        const tbody = table.querySelector('tbody');
        
        students.forEach((student, index) => {
            const row = document.createElement('tr');
            row.className = 'student-row';
            row.dataset.class = cls;
            row.dataset.index = index;
            
            // 이전학적 정보
            const prevClass = student.이전학적반 || '';
            
            // 이전반 배경색 클래스
            const prevClassBgClass = prevClass ? `prev-class-${prevClass}` : '';
            
            row.innerHTML = `
                <td>${student.번호}</td>
                <td>${student.성명}</td>
                <td>${student.생년월일}</td>
                <td>${student.성별}</td>
                <td>${student.기준성적}</td>
                <td>${student.이전학적학년 || ''}</td>
                <td class="${prevClassBgClass}" style="font-weight: bold;">${prevClass}</td>
                <td>${student.이전학적번호 || ''}</td>
            `;
            
            // 상태 표시
            if (changedStudents.has(`${cls}-${student.성명}`)) {
                row.classList.add('changed');
            } else if (movedStudents.has(`${cls}-${student.성명}`)) {
                row.classList.add('moved');
            }
            
            // 클릭 이벤트
            row.addEventListener('click', () => selectStudent(cls, index, row));
            
            tbody.appendChild(row);
        });
        
        classBox.appendChild(table);
        
        // 반 내 버튼
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'class-buttons';
        buttonsDiv.innerHTML = `
            <button class="btn btn-green btn-swap" disabled>바꾸기</button>
            <button class="btn btn-purple btn-move" disabled>다른 반으로 이동</button>
        `;
        
        buttonsDiv.querySelector('.btn-swap').addEventListener('click', swapStudents);
        buttonsDiv.querySelector('.btn-move').addEventListener('click', moveStudents);
        
        classBox.appendChild(buttonsDiv);
        container.appendChild(classBox);
    });
    
    updateButtonState();
    renderStatistics();
}

/* ========================================
   렌더링: 통계 테이블
   ======================================== */
function renderStatistics() {
    const thead = document.querySelector('#currentStats thead');
    const tbody = document.querySelector('#currentStats tbody');

    const validClasses = Object.keys(classData).filter(
        cls => cls !== 'history' && cls !== 'undefined'
    );

    if (validClasses.length === 0) {
        thead.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;">데이터가 없습니다.</td></tr>';
        return;
    }

    // ✅ 이전학적반의 최대값 찾기 (이 값만큼 "이전 n반" 컬럼을 만든다)
    let prevMax = 0;
    validClasses.forEach(cls => {
        const students = classData[cls] || [];
        students.forEach(student => {
            const v = parseInt(student.이전학적반, 10);
            if (!isNaN(v)) prevMax = Math.max(prevMax, v);
        });
    });
    prevMax = Math.max(prevMax, 1); // 안전장치

    // 헤더 생성 (✅ prevMax 기준)
    let headerHTML = `
        <tr>
            <th>구분</th>
            <th>합계</th>
    `;
    for (let i = 1; i <= prevMax; i++) {
        headerHTML += `<th>이전 ${i}반</th>`;
    }
    headerHTML += `
            <th>기준성적 평균</th>
            <th>최고점(이름)</th>
            <th>최저점(이름)</th>
        </tr>
    `;
    thead.innerHTML = headerHTML;

    // 통계 계산
    const classStats = {};

    validClasses.forEach(cls => {
        const students = classData[cls];
        let totalScore = 0;
        let maxScore = -Infinity;
        let minScore = Infinity;
        let maxStudent = '';
        let minStudent = '';

        // ✅ 이전반 카운트 배열도 prevMax 길이로
        const previousClassCount = Array(prevMax).fill(0);

        students.forEach(student => {
            const score = parseFloat(student.기준성적) || 0;

            if (score > maxScore) {
                maxScore = score;
                maxStudent = student.성명;
            }
            if (score < minScore) {
                minScore = score;
                minStudent = student.성명;
            }
            totalScore += score;

            // 이전반 통계 (✅ prevMax 범위로 카운트)
            const prevClass = parseInt(student.이전학적반, 10) - 1;
            if (!isNaN(prevClass) && prevClass >= 0 && prevClass < prevMax) {
                previousClassCount[prevClass]++;
            }
        });

        classStats[cls] = {
            studentCount: students.length,
            avgScore: students.length ? (totalScore / students.length).toFixed(2) : '-',
            maxScore: maxScore !== -Infinity ? maxScore : '-',
            maxStudent,
            minScore: minScore !== Infinity ? minScore : '-',
            minStudent,
            previousClassCount
        };
    });

    // 본문 생성
    tbody.innerHTML = '';

    validClasses.sort((a, b) => {
        const [gradeA, classA] = a.split('-').map(Number);
        const [gradeB, classB] = b.split('-').map(Number);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    }).forEach(cls => {
        const stats = classStats[cls];
        const row = document.createElement('tr');

        const maxCount = Math.max(...stats.previousClassCount);
        const minCount = Math.min(...stats.previousClassCount);

        let rowHTML = `
            <td>${cls}</td>
            <td>${stats.studentCount}</td>
        `;

        stats.previousClassCount.forEach(count => {
            let style = '';
            if (count === maxCount && stats.previousClassCount.filter(c => c === maxCount).length === 1) {
                style = 'background-color: #ffcccc;';
            } else if (count === minCount && stats.previousClassCount.filter(c => c === minCount).length === 1) {
                style = 'background-color: #cce5ff;';
            }
            rowHTML += `<td style="${style}">${count}</td>`;
        });

        rowHTML += `
            <td>${stats.avgScore}</td>
            <td>${stats.maxScore !== '-' ? `${stats.maxScore} (${stats.maxStudent})` : '-'}</td>
            <td>${stats.minScore !== '-' ? `${stats.minScore} (${stats.minStudent})` : '-'}</td>
        `;

        row.innerHTML = rowHTML;
        tbody.appendChild(row);
    });
}

/* ========================================
   학생 선택
   ======================================== */
function selectStudent(cls, index, element) {
    const selectedIndex = selectedStudents.findIndex(
        s => s.cls === cls && s.index === index
    );
    
    if (selectedIndex !== -1) {
        // 이미 선택됨 → 해제
        selectedStudents.splice(selectedIndex, 1);
        element.classList.remove('selected');
    } else {
        // 새로 선택
        selectedStudents.push({ cls, index });
        element.classList.add('selected');
    }
    
    updateButtonState();
}

function updateButtonState() {
    // 전역 버튼
    const globalSwapBtn = document.getElementById('globalSwapButton');
    const globalMoveBtn = document.getElementById('globalMoveButton');
    
    globalSwapBtn.disabled = selectedStudents.length !== 2;
    globalMoveBtn.disabled = selectedStudents.length === 0;
    
    // 반 내 버튼들
    document.querySelectorAll('.btn-swap').forEach(btn => {
        btn.disabled = selectedStudents.length !== 2;
    });
    document.querySelectorAll('.btn-move').forEach(btn => {
        btn.disabled = selectedStudents.length === 0;
    });
}

/* ========================================
   학생 바꾸기
   ======================================== */
function swapStudents() {
    if (selectedStudents.length !== 2) {
        alert('두 명의 학생을 선택해야 합니다.');
        return;
    }
    
    const [first, second] = selectedStudents;
    
    // 같은 반 확인
    if (first.cls === second.cls) {
        if (!confirm('같은 반 학생 2명을 선택했습니다. 그래도 바꾸시겠습니까?')) {
            selectedStudents = [];
            renderClasses();
            return;
        }
    }
    
    // 교환
    const temp = classData[first.cls][first.index];
    classData[first.cls][first.index] = classData[second.cls][second.index];
    classData[second.cls][second.index] = temp;
    
    // 상태 표시
    changedStudents.add(`${first.cls}-${classData[first.cls][first.index].성명}`);
    changedStudents.add(`${second.cls}-${classData[second.cls][second.index].성명}`);
    
    // 이력 추가
    const [, fromClass1] = first.cls.split('-');
    const [, fromClass2] = second.cls.split('-');
    history.push(`(바꿈) ${fromClass1}반 ${temp.성명} ⇔ ${fromClass2}반 ${classData[first.cls][first.index].성명}`);
    
    // 저장 및 렌더링
    saveClassData();
    selectedStudents = [];
    renderClasses();
    renderHistory();
}

/* ========================================
   학생 이동
   ======================================== */
function moveStudents() {
    if (selectedStudents.length === 0) {
        alert('이동할 학생을 선택하세요.');
        return;
    }
    
    // 현재 학년 추출
    const firstClass = selectedStudents[0].cls;
    const currentGrade = firstClass.split('-')[0];
    
    const targetClassInput = prompt('어느 반으로 이동하시겠습니까? (반 숫자만 입력, 예: 1)');
    
    if (!targetClassInput || isNaN(targetClassInput)) {
        alert('유효한 반 숫자를 입력하세요.');
        return;
    }
    
    const targetClass = `${currentGrade}-${targetClassInput}`;
    
    if (!classData[targetClass]) {
        alert(`${currentGrade}학년 ${targetClassInput}반은 유효하지 않습니다.`);
        return;
    }
    
    // 이동할 학생들 추출
    const movingStudents = [];
    
    // 인덱스 내림차순 정렬 (삭제 시 인덱스 꼬임 방지)
    const sortedSelected = [...selectedStudents].sort((a, b) => b.index - a.index);
    
    sortedSelected.forEach(({ cls, index }) => {
        const student = classData[cls][index];
        if (student) {
            movingStudents.push({
                ...student,
                fromClass: cls,
                toClass: targetClass
            });
            // 원래 반에서 제거
            classData[cls].splice(index, 1);
        }
    });
    
    // 새 반에 추가
    movingStudents.forEach(student => {
        classData[targetClass].push(student);
        movedStudents.add(`${targetClass}-${student.성명}`);
        
        // 이력 추가
        const [, fromClassNum] = student.fromClass.split('-');
        const [, toClassNum] = student.toClass.split('-');
        history.push(`(이동) ${fromClassNum}반 ${student.성명} → ${toClassNum}반`);
    });
    
    // 저장 및 렌더링
    saveClassData();
    selectedStudents = [];
    renderClasses();
    renderHistory();
    
    alert('학생 이동이 완료되었습니다.');
}

/* ========================================
   이름순 정렬
   ======================================== */
function sortByName() {
    if (!confirm('학생 이름을 기준으로 오름차순 정렬하시겠습니까?\n번호도 다시 1번부터 재부여됩니다.')) {
        return;
    }
    
    Object.keys(classData).forEach(cls => {
        if (cls === 'history') return;
        
        classData[cls].sort((a, b) => a.성명.localeCompare(b.성명, 'ko'));
        classData[cls].forEach((student, index) => {
            student.번호 = String(index + 1);
        });
    });
    
    saveClassData();
    renderClasses();
    alert('이름 기준 오름차순 정렬이 완료되었습니다.');
}

/* ========================================
   데이터 초기화
   ======================================== */
function resetData() {
    if (!confirm('현재 학년 데이터를 초기화하시겠습니까?\n되돌릴 수 없습니다.')) {
        return;
    }
    
    classData = {};
    history = [];
    changedStudents.clear();
    movedStudents.clear();
    selectedStudents = [];
    
    localStorage.removeItem(getDataKey());
    
    renderClasses();
    renderHistory();
    alert('데이터가 초기화되었습니다.');
}

/* ========================================
   변경 이력 렌더링
   ======================================== */
function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    
    history.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = entry;
        list.appendChild(li);
    });
}

/* ========================================
   PDF 다운로드 (jsPDF)
   ======================================== */
function downloadPdf() {
    const validClasses = Object.keys(classData).filter(
        cls => cls !== 'history' && cls !== 'undefined'
    );
    
    if (validClasses.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    try {
        if (!window.NUCLASS_FONT_BASE64) {
            throw new Error("NUCLASS_FONT_BASE64가 없습니다. nuclass_font.js 로딩 순서를 확인하세요.");
        }
        const FONT_FILE = "NotoSansKR-Regular.ttf";
        const FONT_NAME = "NotoSansKR";
        
        doc.addFileToVFS("NotoSansKR-Regular.ttf", window.NUCLASS_FONT_BASE64);
        doc.addFont("NotoSansKR-Regular.ttf", "NotoSansKR", "normal");

        doc.addFileToVFS("NotoSansKR-Bold.ttf", window.NUCLASS_FONT_BOLD_BASE64);
        doc.addFont("NotoSansKR-Bold.ttf", "NotoSansKR", "bold");  
        window.__NUCLASS_PDF_FONT_REGISTERED__ = true;

        doc.setFont(FONT_NAME, "normal");
    } catch (e) {
        console.error(e);
        alert("PDF 한글 폰트 로딩에 실패했습니다. nuclass_font.js가 정상 로딩되는지 확인하세요.");
        return;
    }
    
    const now = new Date().toLocaleString('ko-KR');
    const year = new Date().getFullYear();
    
    // 페이지 가로 중앙값 계산
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;
    
    // 대제목 - 가운데 정렬
    doc.setFontSize(14);
    doc.text(`${currentSession.schoolName} ${currentSession.grade} NU:CLASS 반편성내역`, centerX, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`(${now})`, centerX, 22, { align: 'center' });
    
    let yPos = 30;
    
    // 반별 테이블
    validClasses.sort((a, b) => {
        const [gradeA, classA] = a.split('-').map(Number);
        const [gradeB, classB] = b.split('-').map(Number);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    }).forEach((cls, idx) => {
        const [grade, classNum] = cls.split('-');
        const students = classData[cls];
        
        if (idx > 0) {
            doc.addPage();
            yPos = 15;
        }
        
        // 반 제목
        doc.setFontSize(12);
        const nextGradeNum = parseInt(currentSession.grade.replace(/[^0-9]/g, '')) + 1;
        doc.text(`${year}학년도 ${nextGradeNum}학년 ${classNum}반`, 14, yPos);
        yPos += 7;
        
        const tableData = students.map(s => [
            grade,
            classNum,
            s.번호,
            s.성명,
            s.생년월일,
            s.성별,
            s.기준성적,
            s.이전학적학년 || '',
            s.이전학적반 || '',
            s.이전학적번호 || ''
        ]);
        
        doc.autoTable({
            startY: yPos,
            head: [['학년', '반', '번호', '성명', '생년월일', '성별', '기준성적', '이전학년', '이전반', '이전번호']],
            body: tableData,
            styles: { 
                fontSize: 8, 
                cellPadding: 2, 
                textColor: [0, 0, 0],  
                font: 'NotoSansKR',
                halign: 'center'       // 내용 가운데 정렬
            },
            headStyles: { 
                fontSize: 8, 
                fillColor: [76, 165, 80],
                textColor: [255, 255, 255],  
                halign: 'center',      // 헤더 가운데 정렬
                fontStyle: 'bold'      // 헤더 굵게
            }
        });
        
        yPos = doc.lastAutoTable.finalY + 10;
    });
    
    // 변경 이력
    if (history.length > 0) {
        doc.addPage();
        doc.setFontSize(12);
        doc.text('변경 이력', centerX, 15, { align: 'center' });
        
        let historyY = 25;
        doc.setFontSize(9);
        history.forEach(entry => {
            if (historyY > 280) {
                doc.addPage();
                historyY = 15;
            }
            doc.text(`- ${entry}`, 14, historyY);
            historyY += 6;
        });
    }
    
    doc.save(`${currentSession.schoolName}_${currentSession.grade}_반편성결과.pdf`);
}
/* ========================================
   엑셀 다운로드 (SheetJS)
   ======================================== */
function downloadExcel() {
    const validClasses = Object.keys(classData).filter(
        cls => cls !== 'history' && cls !== 'undefined'
    );
    
    if (validClasses.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
    }
    
    const allData = [];
    
    validClasses.sort((a, b) => {
        const [gradeA, classA] = a.split('-').map(Number);
        const [gradeB, classB] = b.split('-').map(Number);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    }).forEach(cls => {
        const [grade, classNum] = cls.split('-');
        const students = classData[cls];
        
        students.forEach(student => {
            allData.push({
                '학번': Number(grade) * 1000 + Number(classNum) * 100 + Number(student.번호),
                '성명': student.성명,
                '이전주야과정구분': '주간',
                '이전학년': student.이전학적학년 ? `${student.이전학적학년}학년` : '',
                '이전반': String(student.이전학적반 || '').padStart(2, '0'),
                '이전번호': student.이전학적번호 || '',
                '진급주야과정구분': '주간',
                '진급학년': `${grade}학년`,
                '진급반코드': String(classNum).padStart(2, '0'),
                '진급반번호': student.번호
            });
        });
    });
    
    const ws = XLSX.utils.json_to_sheet(allData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${currentSession.schoolName}_${currentSession.grade}`);
    
    // 열 너비 설정
    ws['!cols'] = [
        { wch: 10 }, // 학번
        { wch: 12 }, // 성명
        { wch: 15 }, // 이전주야과정구분
        { wch: 10 }, // 이전학년
        { wch: 8 },  // 이전반
        { wch: 10 }, // 이전번호
        { wch: 15 }, // 진급주야과정구분
        { wch: 10 }, // 진급학년
        { wch: 10 }, // 진급반코드
        { wch: 10 }  // 진급반번호
    ];
    
    XLSX.writeFile(wb, `${currentSession.schoolName}_${currentSession.grade}_반편성결과.xlsx`);
}

/* ========================================
   백업 (JSON 파일로 저장)
   ======================================== */
function backupToJson() {
    if (Object.keys(classData).length === 0) {
        alert('백업할 데이터가 없습니다.');
        return;
    }
    
    alert('모든 작업 내역이 json파일로 저장됩니다.');
    
    const dataToSave = {
        schoolName: currentSession.schoolName,
        grade: currentSession.grade,
        savedAt: new Date().toISOString(),
        classData: classData,
        history: history,
        changedStudents: Array.from(changedStudents),
        movedStudents: Array.from(movedStudents)
    };
    
    const jsonString = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${currentSession.schoolName}_${currentSession.grade}_백업_${timestamp}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ========================================
   복원 (JSON 파일에서 불러오기)
   ======================================== */
function restoreFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
        alert('JSON 파일만 불러올 수 있습니다.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.classData) {
                throw new Error('유효하지 않은 백업 파일입니다.');
            }
            
            const savedTime = data.savedAt ? new Date(data.savedAt).toLocaleString('ko-KR') : '알 수 없음';
            const savedSchool = data.schoolName || '알 수 없음';
            const savedGrade = data.grade || '알 수 없음';
            
            if (!confirm(`다음 백업을 복원하시겠습니까?\n\n학교: ${savedSchool}\n학년: ${savedGrade}\n저장 시간: ${savedTime}`)) {
                return;
            }
            
            classData = data.classData;
            history = data.history || [];
            changedStudents = new Set(data.changedStudents || []);
            movedStudents = new Set(data.movedStudents || []);
            
            saveClassData();
            renderClasses();
            renderHistory();
            
            alert('복원이 완료되었습니다!');
            
        } catch (error) {
            console.error('JSON 파싱 오류:', error);
            alert('백업 파일을 불러오는 중 오류가 발생했습니다.');
        }
    };
    
    reader.readAsText(file);
    event.target.value = '';
}