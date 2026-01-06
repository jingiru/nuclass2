/* ========================================
   전역 변수
   ======================================== */
let classData = {};          // 반별 학생 데이터
let selectedStudents = [];   // 선택된 학생 목록
let history = [];            // 변경 이력
let changedStudents = new Set();  // 교환된 학생 표시용
let movedStudents = new Set();    // 이동된 학생 표시용
let undoStack = [];  // 되돌리기용 상태 저장 스택
let separationGroups = [];      // 떨어져야 하는 학생 그룹들
let selectedTagStudents = [];   // 모달에서 현재 선택 중인 학생들 (태그)
let separationTeams = [];       // 팀 기반 분리

// 현재 로그인 정보
let currentSession = {
    schoolName: null,
    grade: null,
    isLoggedIn: false
};


let __saveTimer = null;
function scheduleSaveClassData() {
    clearTimeout(__saveTimer);
    __saveTimer = setTimeout(() => {
        saveClassData();
    }, 300);
}



/* ========================================
   유틸리티 함수
   ======================================== */

/**
 * 클래스 키에서 학년, 반 추출
 * @param {string} classKey - "3-2" 형태의 클래스 키
 * @returns {{grade: string, classNum: string}}
 */
function parseClassKey(classKey) {
    const [grade, classNum] = classKey.split('-');
    return { grade, classNum };
}

/**
 * 유효한 클래스 목록 반환 (history, undefined 제외)
 * @returns {string[]}
 */
function getValidClasses() {
    return Object.keys(classData).filter(
        cls => cls !== 'history' && cls !== 'undefined'
    );
}

/**
 * 클래스 목록을 학년-반 순으로 정렬
 * @param {string[]} classes - 클래스 키 배열
 * @returns {string[]}
 */
function sortClasses(classes) {
    return [...classes].sort((a, b) => {
        const parsedA = parseClassKey(a);
        const parsedB = parseClassKey(b);
        const gradeA = Number(parsedA.grade);
        const gradeB = Number(parsedB.grade);
        const classA = Number(parsedA.classNum);
        const classB = Number(parsedB.classNum);
        
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    });
}

/**
 * 유효한 클래스 목록을 정렬해서 반환 
 * @returns {string[]}
 */
function getSortedValidClasses() {
    return sortClasses(getValidClasses());
}





/* ========================================
   샘플 파일 다운로드 모달
   ======================================== */

// 모달 열기
function openSampleModal(showApplyButton = false) {
    document.getElementById('sampleModal').style.display = 'flex';
    
    // "바로 적용" 버튼들 표시/숨김 처리
    const applyButtons = document.querySelectorAll('.apply-btn');
    applyButtons.forEach(btn => {
        btn.style.display = showApplyButton ? 'inline-block' : 'none';
    });
}

// 모달 닫기
function closeSampleModal() {
    document.getElementById('sampleModal').style.display = 'none';
}

// 샘플 PDF 바로 적용
async function applySamplePdf(filename) {
    // 모달 닫기
    closeSampleModal();
    
    // 로딩 표시
    const container = document.getElementById('classesContainer');
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>샘플 PDF를 불러오는 중입니다...</p>
        </div>
    `;
    
    try {
        // GitHub Pages에서 PDF 파일 가져오기
        const response = await fetch(`./${filename}`);
        
        if (!response.ok) {
            throw new Error('파일을 불러올 수 없습니다.');
        }
        
        // Blob으로 변환 후 File 객체 생성
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'application/pdf' });
        
        // 기존 PDF 처리 함수 호출
        await processPdfFile(file);
        
    } catch (error) {
        console.error('샘플 PDF 적용 오류:', error);
        alert('샘플 파일을 불러오는 중 오류가 발생했습니다.');
        renderClasses();
    }
}


// 모달 바깥 영역 클릭 시 닫기
document.addEventListener('click', function(e) {
    const modal = document.getElementById('sampleModal');
    if (e.target === modal) {
        closeSampleModal();
    }
});

// ESC 키로 모달 닫기
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeSampleModal();
    }
});




// PDF.js 워커 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ========================================
   보기 옵션(그리드/표시열) 상태
   ======================================== */
let viewOptions = {
    gridColumns: 2,       // 2 | 3 | 4
    showBirthdate: true,  // 생년월일 열 표시
    showGender: true,     // 성별 열 표시
    showSpecial: false   // ✅ 특이사항 열 표시

};

function getViewOptionsKey() {
    // 세션별로 보기 설정을 따로 저장(학교/학년별)
    if (currentSession && currentSession.schoolName && currentSession.grade) {
        return `nuclass_viewopts_${currentSession.schoolName}_${currentSession.grade}`;
    }
    return 'nuclass_viewopts_default';
}

function loadViewOptions() {
    try {
        const saved = localStorage.getItem(getViewOptionsKey());
        if (saved) {
            const parsed = JSON.parse(saved);
            viewOptions = {
                gridColumns: Number(parsed.gridColumns) || 2,
                showBirthdate: parsed.showBirthdate !== false,
                showGender: parsed.showGender !== false,
                showSpecial: parsed.showSpecial === true // ✅ 기본 false 유지
            };
        }
    } catch (e) {
        console.warn('보기 옵션 로드 실패:', e);
    }
}

function saveViewOptions() {
    try {
        localStorage.setItem(getViewOptionsKey(), JSON.stringify(viewOptions));
    } catch (e) {
        console.warn('보기 옵션 저장 실패:', e);
    }
}

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
    document.getElementById('undoButton').addEventListener('click', undoLastAction);
    document.getElementById('sortByNameButton').addEventListener('click', sortByName);
    document.getElementById('resetDataButton').addEventListener('click', resetData);
    document.getElementById('downloadPdfButton').addEventListener('click', downloadPdf);
    document.getElementById('downloadPdfPublicButton').addEventListener('click', downloadPdfPublic);
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

    // 보기 옵션(그리드/표시열) 이벤트
    initViewOptionControls();

    // 빨간불 기능
    document.getElementById('redFlagButton').addEventListener('click', openRedFlagModal);
    document.getElementById('redFlagStudentInput').addEventListener('keydown', handleStudentInputKeydown);
    document.getElementById('addRedFlagGroup').addEventListener('click', addSeparationGroup);

    // 팀 관련 이벤트 추가
    document.getElementById('teamLeaderInput').addEventListener('keydown', handleTeamLeaderInput);
    document.getElementById('teamMemberInput').addEventListener('keydown', handleTeamMemberInput);
    document.getElementById('addTeam').addEventListener('click', addTeam);

}

/* ========================================
   보기 옵션 컨트롤 이벤트 / 적용
   ======================================== */
function initViewOptionControls() {
    // 라디오(그리드 2/3/4)
    const gridRadios = document.querySelectorAll('input[name="gridColumns"]');
    gridRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const value = Number(radio.value);
            if ([2, 3, 4].includes(value)) {
                viewOptions.gridColumns = value;
                saveViewOptions();
                applyGridColumns();        // 즉시 반영
            }
        });
    });

    // 체크박스(생년월일/성별)
    const birth = document.getElementById('showBirthdate');
    const gender = document.getElementById('showGender');
    const special = document.getElementById('showSpecial'); 

    if (birth) {
        birth.addEventListener('change', () => {
            viewOptions.showBirthdate = birth.checked;
            saveViewOptions();
            applyColumnVisibility();      
        });
    }

    if (gender) {
        gender.addEventListener('change', () => {
            viewOptions.showGender = gender.checked;
            saveViewOptions();
            applyColumnVisibility();      
        });
    }

    if (special) {
        special.addEventListener('change', () => {
            viewOptions.showSpecial = special.checked;
            saveViewOptions();
            applyColumnVisibility(); 
        });
    }
}

function syncViewControlsFromState() {
    // 라디오 동기화
    const gridRadios = document.querySelectorAll('input[name="gridColumns"]');
    gridRadios.forEach(r => {
        r.checked = Number(r.value) === Number(viewOptions.gridColumns);
    });

    // 체크박스 동기화
    const birth = document.getElementById('showBirthdate');
    const gender = document.getElementById('showGender');
    const special = document.getElementById('showSpecial');

    if (birth) birth.checked = !!viewOptions.showBirthdate;
    if (gender) gender.checked = !!viewOptions.showGender;
    if (special) special.checked = !!viewOptions.showSpecial; 
}

function applyViewOptions() {
    // (1) 컨트롤 상태 동기화
    syncViewControlsFromState();

    // (2) 실제 화면 반영
    applyGridColumns();
    applyColumnVisibility();
}

function applyGridColumns() {
    const container = document.getElementById('classesContainer');
    if (!container) return;

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${viewOptions.gridColumns}, minmax(320px, 1fr))`;

    if (!container.style.gap) {
        container.style.gap = '20px';
    }
}

/**
 * 학생 테이블에서 "생년월일", "성별" 열을 전체 숨김/표시
 * 컬럼 순서:
 * 0 번호, 1 성명, 2 생년월일, 3 성별, 4 기준성적, 5~7 이전학적...
 */
function applyColumnVisibility() {
    const tables = document.querySelectorAll('.student-table');
    if (!tables || tables.length === 0) return;

    tables.forEach(table => {
        // thead 첫 번째 줄(th rowspans 있는 줄)
        const theadRows = table.querySelectorAll('thead tr');
        if (theadRows.length > 0) {
            const topHeaderCells = theadRows[0].children;
            toggleCellDisplay(topHeaderCells[2], viewOptions.showBirthdate);
            toggleCellDisplay(topHeaderCells[3], viewOptions.showGender);

            const specialTh = table.querySelector('thead .col-special');
            toggleCellDisplay(specialTh, viewOptions.showSpecial);
        }

        // tbody 모든 행 td
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(tr => {
            const tds = tr.children;
            toggleCellDisplay(tds[2], viewOptions.showBirthdate); // 생년월일
            toggleCellDisplay(tds[3], viewOptions.showGender);    // 성별
            toggleCellDisplay(tds[8], viewOptions.showSpecial);
        });
    });
}

function toggleCellDisplay(cell, show) {
    if (!cell) return;
    cell.style.display = show ? '' : 'none';
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

    // 보기 옵션 로드 및 적용
    loadViewOptions();
    applyViewOptions();
}

/* ========================================
   세션 관리 (localStorage)
   ======================================== */
function loadSession() {
    const saved = sessionStorage.getItem('nuclass_session');
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
    sessionStorage.setItem('nuclass_session', JSON.stringify(currentSession));
}

function clearSession() {
    currentSession = {
        schoolName: null,
        grade: null,
        isLoggedIn: false
    };
    sessionStorage.removeItem('nuclass_session');
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
    separationTeams = []; 
    
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

    // 빨간불 데이터 로드
    loadRedFlagData();

    // 팀 데이터 로드 추가
    loadTeamData();

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
    // 예1: 3 1 1 따뜻이 2011.07.23. 여 634.17 2 5 28
    // 예2: 3학년 1 1 Ayu Lestari 2011.07.23. 여 634.17 2 5 28\
    // \s*(?:학년)?\s+ - "2학년", "2 학년", "2" 모두 처리 가능
    const normalPattern = /(\d+)\s*(?:학년)?\s+(\d+)\s+(\d+)\s+([^\d]+?)\s+(\d{4}\.\d{2}\.\d{2})\.?\s+(남|여)\s+([\d.]+)\s+(\d+)\s*(?:학년)?\s+(\d+)\s+(\d+)/g;
    
    // 패턴 2: 전입생 (이전학적이 "전입"인 경우)
    // 예1: 2 1 29 하늘이 2012.02.10. 여 984.01 전입
    // 예2: 2학년 1 29 하늘이 2012.02.10. 여 984.01 전입 
    const transferInPattern = /(\d+)\s*(?:학년)?\s+(\d+)\s+(\d+)\s+([^\d]+?)\s+(\d{4}\.\d{2}\.\d{2})\.?\s+(남|여)\s+([\d.]+)\s+전입/g;
     
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
            성명: name.trim(),
            생년월일: birthDate + '.',
            성별: gender,
            기준성적: score,
            이전학적: `${prevGrade} ${prevClass} ${prevNumber}`,
            이전학적학년: prevGrade,
            이전학적반: prevClass,
            이전학적번호: prevNumber
        });
    }
    
    // 전입생 파싱
    while ((match = transferInPattern.exec(text)) !== null) {
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
            성명: name.trim(),
            생년월일: birthDate + '.',
            성별: gender,
            기준성적: score,
            이전학적: '전입',
            이전학적학년: String(parseInt(grade) - 1),
            이전학적반: '0',
            이전학적번호: '0'
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
    
    const validClasses = getValidClasses();
    
    // 데이터 유무에 따라 버튼 활성화/비활성화
    const hasData = validClasses.length > 0;
    document.getElementById('sortByNameButton').disabled = !hasData;
    document.getElementById('downloadPdfButton').disabled = !hasData;
    document.getElementById('downloadPdfPublicButton').disabled = !hasData;
    document.getElementById('downloadExcelButton').disabled = !hasData;
    document.getElementById('backupButton').disabled = !hasData;
    document.getElementById('resetDataButton').disabled = !hasData;
    
    if (validClasses.length === 0) {
        container.innerHTML = `
            <div class="empty-message" style="grid-column: 1 / -1;">
                <div class="icon">📄</div>
                <p>PDF 파일을 업로드해주세요.</p>
                <p>나이스 - 학적 - 진급대상자 반편성관리 - 일괄반편성 작업 후 => <br> 반편성결과조회 - 반편성조회(배정반기준) - 전체반 옵션 선택 - 출력 - PDF 저장</p>
                <p><strong>엑셀 등을 변환한 PDF 파일은 호환되지 않습니다</strong></p>
                <p>(여기에 파일 드래그&드롭 가능)</p>
            </div>
        `;
        renderStatistics();
        return;
    }
    
    // 반 정렬 (학년-반 순)
    const sortedClasses = sortClasses(validClasses); 
    
    sortedClasses.forEach(cls => {
        const { grade, classNum: classNumber } = parseClassKey(cls); 
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
                    <th rowspan="2" class="col-special">메모</th>
                </tr>
                <tr>
                    <th>학년</th>
                    <th>반</th>
                    <th>번호</th>
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

            const memoValue = student.특이사항 || '';
            const memoEscaped = String(memoValue).replace(/"/g, '&quot;');
            row.innerHTML = `
                <td>${student.번호}</td>
                <td>${student.성명}</td>
                <td>${student.생년월일}</td>
                <td>${student.성별}</td>
                <td>${student.기준성적}</td>
                <td>${student.이전학적학년 || ''}</td>
                <td class="${prevClassBgClass}" style="font-weight: bold;">${prevClass}</td>
                <td>${student.이전학적번호 || ''}</td>
                <td class="col-special">
                    <input
                      type="text"
                      class="special-input"
                      value="${memoValue.replace(/"/g, '&quot;')}"
                    />
                </td>

            `;

            const input = row.querySelector('.special-input');
            if (input) {
                // 입력 클릭 시 행 선택 토글 방지
                input.addEventListener('click', (e) => e.stopPropagation());
                input.addEventListener('keydown', (e) => e.stopPropagation());

                // 입력 내용 저장 (간단 debounce)
                input.addEventListener('input', () => {
                    student.특이사항 = input.value;
                    scheduleSaveClassData(); // 아래 3단계에서 추가
                });
            }
            
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
            <button class="btn btn-purple btn-move" disabled>다른 반 이동</button>
            <button class="btn btn-gray btn-undo" disabled>되돌리기</button>
        `;
        
        buttonsDiv.querySelector('.btn-swap').addEventListener('click', swapStudents);
        buttonsDiv.querySelector('.btn-move').addEventListener('click', moveStudents);
        buttonsDiv.querySelector('.btn-undo').addEventListener('click', undoLastAction);
        
        classBox.appendChild(buttonsDiv);
        container.appendChild(classBox);
    });
    
    updateButtonState();
    renderStatistics();

    // 학생 테이블이 다시 그려진 뒤, 열 숨김/표시 및 그리드 즉시 재적용
    applyViewOptions();
    
    // 되돌리기 버튼 상태 업데이트
    updateUndoButtonState();
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

    // 이전학적반의 최대값 찾기 (이 값만큼 "이전 n반" 컬럼을 만든다)
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
            <th>인원</th>
            <th>남</th>
            <th>여</th>
    `;
    for (let i = 1; i <= prevMax; i++) {
        headerHTML += `<th>이전 ${i}반</th>`;
    }
    headerHTML += `
            <th>성적 평균</th>
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
        let maleCount = 0;     
        let femaleCount = 0; 

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

            // 성별 카운트
            if (student.성별 === '남') maleCount++;
            else if (student.성별 === '여') femaleCount++;

            // 이전반 통계 (✅ prevMax 범위로 카운트)
            const prevClass = parseInt(student.이전학적반, 10) - 1;
            if (!isNaN(prevClass) && prevClass >= 0 && prevClass < prevMax) {
                previousClassCount[prevClass]++;
            }
        });

        classStats[cls] = {
            studentCount: students.length,
            maleCount,      
            femaleCount,    
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

    // 빨간불 위반 개수 계산
    const classViolations = calculateClassViolations();

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

        // 위반 개수에 따른 빨간색 클래스 결정
        const violationCount = classViolations[cls] || 0;
        let violationClass = '';
        if (violationCount >= 5) {
            violationClass = 'violation-level-5';
        } else if (violationCount >= 4) {
            violationClass = 'violation-level-4';
        } else if (violationCount >= 3) {
            violationClass = 'violation-level-3';
        } else if (violationCount >= 2) {
            violationClass = 'violation-level-2';
        } else if (violationCount >= 1) {
            violationClass = 'violation-level-1';
        }

        // 툴팁 정보 생성
        const tooltipText = violationCount > 0 ? getViolationDetails(cls) : '';

        let rowHTML = `
            <td class="${violationClass}" ${violationCount > 0 ? `data-violation="${cls}"` : ''}>
                ${cls}${violationCount > 0 ? ` 🚨${violationCount}` : ''}
            <td>${stats.studentCount}</td>
            <td>${stats.maleCount}</td>     
            <td>${stats.femaleCount}</td>   
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
    
        // 툴팁 이벤트 추가
        if (violationCount > 0) {
            const violationCell = row.querySelector('[data-violation]');
            violationCell.style.cursor = 'help';
            violationCell.addEventListener('mouseenter', (e) => showViolationTooltip(e, tooltipText));
            violationCell.addEventListener('mouseleave', hideViolationTooltip);
        }

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
    
    // ☆ 되돌리기용 상태 저장 (작업 전에 호출!)
    saveStateForUndo();
    
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
    
    // ☆ 되돌리기용 상태 저장 (작업 전에 호출!)
    saveStateForUndo();
    
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
   되돌리기(Undo) 기능
   ======================================== */

// 현재 상태를 undoStack에 저장
function saveStateForUndo() {
    const state = {
        classData: JSON.parse(JSON.stringify(classData)),  // 깊은 복사
        history: [...history],
        changedStudents: new Set(changedStudents),
        movedStudents: new Set(movedStudents)
    };
    undoStack.push(state);
    
    // 스택이 너무 커지지 않도록 최대 20개까지만 유지
    if (undoStack.length > 20) {
        undoStack.shift();
    }
    
    updateUndoButtonState();
}

// 되돌리기 실행
function undoLastAction() {
    if (undoStack.length === 0) {
        alert('되돌릴 작업이 없습니다.');
        return;
    }
    
    // 마지막 저장 상태 꺼내기
    const prevState = undoStack.pop();
    
    // 상태 복원
    classData = prevState.classData;
    history = prevState.history;
    changedStudents = prevState.changedStudents;
    movedStudents = prevState.movedStudents;
    
    // 저장 및 화면 갱신
    saveClassData();
    selectedStudents = [];
    renderClasses();
    renderHistory();
    
    updateUndoButtonState();
}

// 되돌리기 버튼 활성화/비활성화 업데이트
function updateUndoButtonState() {
    const hasUndo = undoStack.length > 0;
    
    // 상단 되돌리기 버튼
    const globalUndoBtn = document.getElementById('undoButton');
    if (globalUndoBtn) {
        globalUndoBtn.disabled = !hasUndo;
    }
    
    // 반별 되돌리기 버튼들
    document.querySelectorAll('.btn-undo').forEach(btn => {
        btn.disabled = !hasUndo;
    });
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
    separationGroups = [];
    separationTeams = [];
    
    localStorage.removeItem(getDataKey());
    localStorage.removeItem(getRedFlagKey());
    localStorage.removeItem(getTeamKey());
    
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
   PDF 다운로드 - 확인용 (jsPDF)
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

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;

    // -------------------------------
    // 0) 공통 정렬/정의
    // -------------------------------
    const sortedClasses = [...validClasses].sort((a, b) => {
        const [gradeA, classA] = a.split('-').map(Number);
        const [gradeB, classB] = b.split('-').map(Number);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    });

    // -------------------------------
    // 1) 첫 페이지: 제목
    // -------------------------------
    doc.setFontSize(14);
    doc.text(
        `${currentSession.schoolName} ${currentSession.grade} NU:CLASS 반편성내역`,
        centerX,
        15,
        { align: 'center' }
    );
    doc.setFontSize(10);
    doc.text(`(${now})`, centerX, 22, { align: 'center' });

    let yPos = 30;

    // -------------------------------
    // 2) 첫 페이지: 현재 현황(통계) 테이블
    //    - 2줄 헤더 구조로 변경
    //    - 남/여 컬럼 추가
    // -------------------------------
    function buildStatsData() {
        // prevMax 계산 (이전학적반 최대치)
        let prevMax = 0;
        sortedClasses.forEach(cls => {
            const students = classData[cls] || [];
            students.forEach(student => {
                const v = parseInt(student.이전학적반, 10);
                if (!isNaN(v)) prevMax = Math.max(prevMax, v);
            });
        });
        prevMax = Math.max(prevMax, 1);

        // =============================================
        // 2줄 헤더 구성 (jspdf-autotable 형식)
        // =============================================
        // 첫 번째 줄
        const headerRow1 = [
            { content: '구분', rowSpan: 2 },
            { content: '인원', rowSpan: 2 },
            { content: '남', rowSpan: 2 },
            { content: '여', rowSpan: 2 },
            { content: '이전 반', colSpan: prevMax },
            { content: '성적\n평균', rowSpan: 2 },
            { content: '최고점\n(이름)', rowSpan: 2 },
            { content: '최저점\n(이름)', rowSpan: 2 }
        ];

        // 두 번째 줄 (이전 반 세부 컬럼)
        const headerRow2 = [];
        for (let i = 1; i <= prevMax; i++) {
            headerRow2.push(`${i}반`);
        }

        const head = [headerRow1, headerRow2];

        // =============================================
        // 바디 구성
        // =============================================
        const body = [];
        sortedClasses.forEach(cls => {
            const students = classData[cls] || [];
            let totalScore = 0;
            let maxScore = -Infinity;
            let minScore = Infinity;
            let maxStudent = '';
            let minStudent = '';
            let maleCount = 0;
            let femaleCount = 0;

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

                // 남/여 카운트
                if (student.성별 === '남') {
                    maleCount++;
                } else if (student.성별 === '여') {
                    femaleCount++;
                }

                const prevClass = parseInt(student.이전학적반, 10) - 1;
                if (!isNaN(prevClass) && prevClass >= 0 && prevClass < prevMax) {
                    previousClassCount[prevClass]++;
                }
            });

            const avgScore = students.length ? (totalScore / students.length).toFixed(2) : '-';
            const maxText = maxScore !== -Infinity ? `${maxScore}\n(${maxStudent})` : '-';
            const minText = minScore !== Infinity ? `${minScore}\n(${minStudent})` : '-';

            body.push([
                cls,                           // 구분
                String(students.length),       // 인원
                String(maleCount),             // 남
                String(femaleCount),           // 여
                ...previousClassCount.map(String),  // 이전 반들
                String(avgScore),              // 성적 평균
                maxText,                       // 최고점(이름)
                minText                        // 최저점(이름)
            ]);
        });

        return { head, body, prevMax };
    }

    // 섹션 제목
    doc.setFontSize(12);
    doc.text('통계', 14, yPos);
    yPos += 4;

    const { head: statsHead, body: statsBody, prevMax } = buildStatsData();

    // ✅ 통계표 컬럼 폭 제어
    const marginLeft = 6;
    const marginRight = 5;
    const availableWidth = pageWidth - marginLeft - marginRight;

    // 컬럼 인덱스 계산 (구분, 인원, 남, 여, 이전반들..., 성적평균, 최고점, 최저점)
    // 총 컬럼 수 = 4 + prevMax + 3 = 7 + prevMax
    const idxAvg = 4 + prevMax;
    const idxMax = 5 + prevMax;
    const idxMin = 6 + prevMax;

    // 폭(mm) 배분
    const wCategory = 11;  // 구분
    const wTotal = 9;      // 인원
    const wMale = 8;       // 남
    const wFemale = 8;     // 여
    const wAvg = 13;       // 성적 평균
    const wMax = 22;       // 최고점(이름)
    const wMin = 22;       // 최저점(이름)

    const fixed = wCategory + wTotal + wMale + wFemale + wAvg + wMax + wMin;
    const wPrev = Math.max(9, Math.floor((availableWidth - fixed) / prevMax));

    const statsColumnStyles = {
        0: { cellWidth: wCategory },
        1: { cellWidth: wTotal },
        2: { cellWidth: wMale },
        3: { cellWidth: wFemale },
        [idxAvg]: { cellWidth: wAvg },
        [idxMax]: { cellWidth: wMax },
        [idxMin]: { cellWidth: wMin }
    };

    for (let i = 0; i < prevMax; i++) {
        statsColumnStyles[4 + i] = { cellWidth: wPrev };
    }

    doc.autoTable({
        startY: yPos,
        head: statsHead,
        body: statsBody,
        margin: { left: marginLeft, right: marginRight },
        styles: {
            fontSize: 8,
            cellPadding: 2,
            textColor: [0, 0, 0],
            font: 'NotoSansKR',
            halign: 'center',
            valign: 'middle',
            lineColor: [200, 200, 200],  // 흐미한 회색 구분선
            lineWidth: 0.3
        },
        headStyles: {
            fontSize: 8,
            fillColor: [76, 165, 80],
            textColor: [255, 255, 255],
            halign: 'center',
            fontStyle: 'bold',
            lineColor: [200, 200, 200],  // 헤더는 하얀색 구분선
            lineWidth: 0.3
        },
        columnStyles: statsColumnStyles
    });

    yPos = doc.lastAutoTable.finalY + 8;

    // -------------------------------
    // 3) 첫 페이지: 변경 이력(통계 밑)
    //    - 공간 부족 시, "요약 페이지"를 추가로 만들어 계속 출력
    //    - 요약이 끝난 다음에 반별 페이지 시작
    // -------------------------------
    doc.setFontSize(12);
    doc.text('변경 이력', 14, yPos);
    yPos += 6;

    doc.setFontSize(9);

    const bottomMargin = 12;
    const lineHeight = 6;

    if (history.length === 0) {
        doc.text('- 변경 이력이 없습니다.', 14, yPos);
        yPos += lineHeight;
    } else {
        history.forEach(entry => {
            // 다음 줄을 쓸 공간이 없으면 "요약 페이지" 추가
            if (yPos + lineHeight > pageHeight - bottomMargin) {
                doc.addPage();
                yPos = 15;

                // 요약 페이지에도 구분을 위해 제목을 한 번 더 표시(원치 않으면 삭제 가능)
                doc.setFontSize(12);
                doc.text('변경 이력(계속)', 14, yPos);
                yPos += 6;
                doc.setFontSize(9);
            }

            doc.text(`- ${entry}`, 14, yPos);
            yPos += lineHeight;
        });
    }

    // -------------------------------
    // 4) 반별 테이블은 "요약 끝난 다음"부터 시작
    // -------------------------------
    sortedClasses.forEach((cls, idx) => {
        const [grade, classNum] = cls.split('-');
        const students = classData[cls];

        // 첫 반 시작 전에 무조건 새 페이지 (요약이 PDF 맨 앞에 오도록)
        doc.addPage();
        let classY = 15;

        // 반 제목
        doc.setFontSize(12);
        const nextGradeNum = parseInt(currentSession.grade.replace(/[^0-9]/g, '')) + 1;
        doc.text(`${currentSession.schoolName} ${year}학년도 ${nextGradeNum}학년 ${classNum}반`, 14, classY);
        classY += 7;

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
            startY: classY,
            head: [['학년', '반', '번호', '성명', '생년월일', '성별', '기준성적', '이전학년', '이전반', '이전번호']],
            body: tableData,
            styles: {
                fontSize: 8,
                cellPadding: 2,
                textColor: [0, 0, 0],
                font: 'NotoSansKR',
                halign: 'center',
                lineWidth: 0  // 기본 선 제거
            },
            headStyles: {
                fontSize: 7,
                fillColor: [76, 165, 80],
                textColor: [255, 255, 255],
                halign: 'center',
                fontStyle: 'bold',
                lineColor: [200, 200, 200],
                lineWidth: 0
            },
            // 내부 세로선만 그리기 (바깥 테두리 제외)
            didDrawCell: function(data) {
                const colCount = 10;  // 총 컬럼 수
                // 마지막 컬럼이 아닌 경우에만 오른쪽에 세로선 그리기
                if (data.column.index < colCount - 1) {
                    doc.setDrawColor(200, 200, 200);  // 흐미한 회색
                    doc.setLineWidth(0.5);
                    // 셀 오른쪽 경계에 세로선
                    doc.line(
                        data.cell.x + data.cell.width,
                        data.cell.y,
                        data.cell.x + data.cell.width,
                        data.cell.y + data.cell.height
                    );
                }
            }
        });
    });

    const nowDate = new Date();

    const yy = String(nowDate.getFullYear()).slice(-2);
    const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nowDate.getDate()).padStart(2, '0');

    const hh = String(nowDate.getHours()).padStart(2, '0');
    const mi = String(nowDate.getMinutes()).padStart(2, '0');
    const ss = String(nowDate.getSeconds()).padStart(2, '0');

    const fileTimestamp = `${yy}${mm}${dd}_${hh}${mi}${ss}`;



    doc.save(`${currentSession.schoolName}_${currentSession.grade}_반편성결과_${fileTimestamp}.pdf`);
}


/**
 * 이름 마스킹 함수
 * - 한글 이름: 두번째 위치 마스킹 (4글자 이상은 중간 전체 마스킹)
 * - 영어 이름(공백 포함): 각 단어별 앞 2글자만 표시 (2글자면 1글자만)
 */
function maskName(name) {
    if (!name) return '';
    
    // 공백이 있으면 영어 이름으로 판단
    if (name.includes(' ')) {
        return name.split(' ').map(word => {
            if (word.length <= 1) return word;
            if (word.length === 2) return word[0] + '*';
            // 3글자 이상: 앞 2글자 + 나머지 *
            return word.slice(0, 2) + '*'.repeat(word.length - 2);
        }).join(' ');
    }
    
    // 한글 이름 처리
    const len = name.length;
    if (len <= 1) return name;
    if (len === 2) return name[0] + '*';
    if (len === 3) return name[0] + '*' + name[2];
    // 4글자 이상: 첫글자 + ** + 마지막글자
    return name[0] + '*'.repeat(len - 2) + name[len - 1];
}


/* ========================================
   PDF 다운로드 - 공지용 (jsPDF)
   - 통계, 변경 이력 제외
   - 기준성적 제외
   - 학년, 반, 번호, 성명, 생년월일, 성별, 이전학년, 이전반, 이전번호만 포함
   ======================================== */

function downloadPdfPublic() {
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

    const year = new Date().getFullYear();

    // -------------------------------
    // 반 정렬
    // -------------------------------
    const sortedClasses = [...validClasses].sort((a, b) => {
        const [gradeA, classA] = a.split('-').map(Number);
        const [gradeB, classB] = b.split('-').map(Number);
        if (gradeA !== gradeB) return gradeA - gradeB;
        return classA - classB;
    });

    // -------------------------------
    // 반별 테이블만 출력 (통계/이력 없음, 기준성적 없음)
    // -------------------------------
    sortedClasses.forEach((cls, idx) => {
        const [grade, classNum] = cls.split('-');
        const students = classData[cls];

        // 첫 반이 아니면 새 페이지 추가
        if (idx > 0) {
            doc.addPage();
        }

        let classY = 15;

        // 반 제목
        doc.setFontSize(12);
        const nextGradeNum = parseInt(currentSession.grade.replace(/[^0-9]/g, '')) + 1;
        doc.text(`${currentSession.schoolName} ${year}학년도 ${nextGradeNum}학년 ${classNum}반`, 14, classY);
        classY += 7;

        // 테이블 데이터 (기준성적 제외, 이름 마스킹 적용!)
        const tableData = students.map(s => [
            grade,
            classNum,
            s.번호,
            maskName(s.성명),  // ← 마스킹 적용
            s.생년월일,
            s.성별,
            s.이전학적학년 || '',
            s.이전학적반 || '',
            s.이전학적번호 || ''
        ]);

        doc.autoTable({
            startY: classY,
            head: [['학년', '반', '번호', '성명', '생년월일', '성별', '이전학년', '이전반', '이전번호']],
            body: tableData,
            styles: {
                fontSize: 8,
                cellPadding: 2,
                textColor: [0, 0, 0],
                font: 'NotoSansKR',
                halign: 'center',
                lineWidth: 0
            },
            headStyles: {
                fontSize: 7,
                fillColor: [76, 165, 80],
                textColor: [255, 255, 255],
                halign: 'center',
                fontStyle: 'bold',
                lineColor: [200, 200, 200],
                lineWidth: 0
            },
            didDrawCell: function(data) {
                const colCount = 9;  // 총 컬럼 수 (기준성적 제외했으므로 9개)
                if (data.column.index < colCount - 1) {
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.5);
                    doc.line(
                        data.cell.x + data.cell.width,
                        data.cell.y,
                        data.cell.x + data.cell.width,
                        data.cell.y + data.cell.height
                    );
                }
            }
        });
    });

    // 파일명 생성
    const nowDate = new Date();
    const yy = String(nowDate.getFullYear()).slice(-2);
    const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nowDate.getDate()).padStart(2, '0');
    const hh = String(nowDate.getHours()).padStart(2, '0');
    const mi = String(nowDate.getMinutes()).padStart(2, '0');
    const ss = String(nowDate.getSeconds()).padStart(2, '0');
    const fileTimestamp = `${yy}${mm}${dd}_${hh}${mi}${ss}`;

    doc.save(`${currentSession.schoolName}_${currentSession.grade}_반편성결과_공지용_${fileTimestamp}.pdf`);
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
        const [gradeB, classB] = a.split('-').map(Number);
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
                '이전반': String(student.이전학적반 || ''),
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
        movedStudents: Array.from(movedStudents),
        separationGroups: separationGroups,
        separationTeams: separationTeams
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
            separationGroups = data.separationGroups || [];
            separationTeams = data.separationTeams || [];
            
            saveClassData();
            saveRedFlagData();
            saveTeamData();
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


/* ========================================
   빨간불 기능 (떨어져야 하는 학생 관리)
   ======================================== */

// 빨간불 데이터 저장 키
function getRedFlagKey() {
    return `nuclass_redflag_${currentSession.schoolName}_${currentSession.grade}`;
}

// 빨간불 데이터 저장
function saveRedFlagData() {
    localStorage.setItem(getRedFlagKey(), JSON.stringify(separationGroups));
}

// 빨간불 데이터 불러오기
function loadRedFlagData() {
    const saved = localStorage.getItem(getRedFlagKey());
    if (saved) {
        separationGroups = JSON.parse(saved);
    } else {
        separationGroups = [];
    }
}


// 팀 데이터 저장 키
function getTeamKey() {
    return `nuclass_teams_${currentSession.schoolName}_${currentSession.grade}`;
}

// 팀 데이터 저장
function saveTeamData() {
    localStorage.setItem(getTeamKey(), JSON.stringify(separationTeams));
}

// 팀 데이터 불러오기
function loadTeamData() {
    const saved = localStorage.getItem(getTeamKey());
    if (saved) {
        separationTeams = JSON.parse(saved);
    } else {
        separationTeams = [];
    }
}


// 탭 전환
function switchTab(tabName) {
    const groupTab = document.getElementById('groupTab');
    const teamTab = document.getElementById('teamTab');
    const groupContent = document.getElementById('groupTabContent');
    const teamContent = document.getElementById('teamTabContent');
    
    if (tabName === 'group') {
        groupTab.classList.add('active');
        teamTab.classList.remove('active');
        groupContent.style.display = 'block';
        teamContent.style.display = 'none';
    } else {
        groupTab.classList.remove('active');
        teamTab.classList.add('active');
        groupContent.style.display = 'none';
        teamContent.style.display = 'block';
    }
}


let selectedTeamLeader = '';
let selectedTeamMembers = [];


/**
 * 학생 입력 공통 처리 함수
 * @param {KeyboardEvent} e - 키보드 이벤트
 * @param {Object} config - 설정 객체
 */
function handleStudentInput(e, config) {
    if (e.key !== 'Enter') return;
    
    e.preventDefault();
    
    const input = document.getElementById(config.inputId);
    const value = input.value.trim();
    
    if (!value) return;
    
    // 1) 추가 검증 (예: 리더와 같은 이름인지)
    if (config.extraValidation) {
        const errorMsg = config.extraValidation(value);
        if (errorMsg) {
            alert(errorMsg);
            return;
        }
    }
    
    // 2) 중복 체크 (배열 타입일 때만)
    if (config.duplicateCheck && config.storageType === 'array') {
        const currentArray = config.getStorage();
        if (currentArray.includes(value)) {
            alert('이미 추가된 학생입니다.');
            input.value = '';
            return;
        }
    }
    
    // 3) 후보 찾기
    const candidates = findStudentCandidates(value);
    
    if (candidates.length === 0) {
        alert('학생 목록에 없는 이름입니다. 정확한 이름을 입력해주세요.');
        return;
    }
    
    // 4) 동명이인 처리
    if (candidates.length > 1) {
        showStudentSelectionUI(candidates, (selected) => {
            // 배열 타입: 중복 체크 후 push
            if (config.storageType === 'array') {
                if (config.getStorage().includes(selected)) {
                    alert('이미 추가된 학생입니다.');
                    return;
                }
                config.setStorage(selected);
            } else {
                // 단일 값 타입: 그냥 저장
                config.setStorage(selected);
            }
            config.renderFn();
            input.value = '';
            if (config.keepFocus) input.focus();
        });
        return;
    }
    
    // 5) 단일 학생 처리
    const displayName = candidates[0].name;
    
    if (config.storageType === 'array') {
        // displayName vs candidates[0].displayName 구분 필요
        const nameToStore = candidates.length === 1 ? candidates[0].name : displayName;
        if (config.duplicateCheck && config.getStorage().includes(nameToStore)) {
            alert('이미 추가된 학생입니다.');
            input.value = '';
            return;
        }
        config.setStorage(nameToStore);
    } else {
        config.setStorage(candidates[0].name);
    }
    
    config.renderFn();
    input.value = '';
    if (config.keepFocus) input.focus();
}





// 지정 학생 입력 처리
function handleTeamLeaderInput(e) {
    handleStudentInput(e, {
        inputId: 'teamLeaderInput',
        storageType: 'single',
        getStorage: () => selectedTeamLeader,
        setStorage: (val) => { selectedTeamLeader = val; },
        renderFn: renderTeamLeaderTag,
        duplicateCheck: false,
        extraValidation: null,
        keepFocus: false
    });
}


// 팀원 입력 처리
function handleTeamMemberInput(e) {
    handleStudentInput(e, {
        inputId: 'teamMemberInput',
        storageType: 'array',
        getStorage: () => selectedTeamMembers,
        setStorage: (val) => selectedTeamMembers.push(val),
        renderFn: renderTeamMemberTags,
        duplicateCheck: true,
        extraValidation: (value) => {
            // 지정 학생과 중복 체크
            const inputBaseName = value;
            const leaderBaseName = selectedTeamLeader.match(/^(.+?)(?:\(|$)/)?.[1];
            if (inputBaseName === leaderBaseName) {
                return '지정 학생과 같은 학생은 분리 학생으로 추가할 수 없습니다.';
            }
            return null;  // 문제 없으면 null 반환
        },
        keepFocus: false
    });
}

// 팀장 태그 렌더링
function renderTeamLeaderTag() {
    const container = document.getElementById('teamLeaderTag');
    container.innerHTML = '';
    
    if (!selectedTeamLeader) return;
    
    const tag = document.createElement('span');
    tag.className = 'student-tag';
    tag.innerHTML = `
        ${selectedTeamLeader}
        <span class="remove-tag" onclick="removeTeamLeader()">&times;</span>
    `;
    container.appendChild(tag);
}

// 팀원 태그 렌더링
function renderTeamMemberTags() {
    const container = document.getElementById('teamMemberTags');
    container.innerHTML = '';
    
    selectedTeamMembers.forEach((member, index) => {
        const tag = document.createElement('span');
        tag.className = 'student-tag';
        tag.innerHTML = `
            ${member}
            <span class="remove-tag" onclick="removeTeamMember(${index})">&times;</span>
        `;
        container.appendChild(tag);
    });
}

// 팀장 제거
function removeTeamLeader() {
    selectedTeamLeader = '';
    renderTeamLeaderTag();
}

// 팀원 제거
function removeTeamMember(index) {
    selectedTeamMembers.splice(index, 1);
    renderTeamMemberTags();
}

// 팀 추가
function addTeam() {
    if (!selectedTeamLeader) {
        alert('지정 학생을 선택해주세요.');
        return;
    }
    
    if (selectedTeamMembers.length === 0) {
        alert('최소 1명의 분리 학생을 추가해주세요.');
        return;
    }
    
    const reason = document.getElementById('teamReason').value.trim();
    
    const newTeam = {
        id: Date.now(),
        leader: selectedTeamLeader,
        members: [...selectedTeamMembers],
        reason: reason || '(사유 없음)'
    };
    
    separationTeams.push(newTeam);
    saveTeamData();
    
    // 입력 초기화
    selectedTeamLeader = '';
    selectedTeamMembers = [];
    document.getElementById('teamLeaderInput').value = '';
    document.getElementById('teamMemberInput').value = '';
    document.getElementById('teamReason').value = '';
    renderTeamLeaderTag();
    renderTeamMemberTags();
    
    // 목록 다시 렌더링
    renderTeamList();
    
}

// 팀 삭제
function deleteTeam(teamId) {
    separationTeams = separationTeams.filter(t => t.id !== teamId);
    saveTeamData();
    renderTeamList();
}

// 팀 목록 렌더링
function renderTeamList() {
    const container = document.getElementById('teamList');
    container.innerHTML = '';
    
    if (separationTeams.length === 0) {
        return;
    }
    
    separationTeams.forEach(team => {
        const item = document.createElement('div');
        item.className = 'group-item';
        
        // 위반 여부 체크
        const violation = checkTeamViolation(team);
        
        item.innerHTML = `
            <div class="group-info">
                <div class="group-students">
                    <strong style="color: #f44336;">지정 학생:</strong> ${team.leader} / 
                    <strong style="color: #2196F3;">분리 학생:</strong> ${team.members.join(', ')}
                </div>
                <div class="group-reason">${team.reason}</div>
                <div class="group-status ${violation.hasViolation ? 'violation' : 'ok'}">
                    ${violation.hasViolation 
                        ? `⚠️ 지정 학생과 같은 반: ${violation.details}` 
                        : '✓ 지정 학생이 분리 학생들과 다른 반'}
                </div>
            </div>
            <button class="delete-group" onclick="deleteTeam(${team.id})">&times;</button>
        `;
        
        container.appendChild(item);
    });
}

// 팀 위반 체크
function checkTeamViolation(team) {
    const leaderClass = findStudentClass(team.leader);
    if (!leaderClass) {
        return { hasViolation: false, details: '' };
    }
    
    const violations = [];
    team.members.forEach(member => {
        const memberClass = findStudentClass(member);
        if (memberClass === leaderClass) {
            const [, classNum] = memberClass.split('-');
            violations.push(member);
        }
    });
    
    return {
        hasViolation: violations.length > 0,
        details: violations.join(', ')
    };
}



// 모달 열기
function openRedFlagModal() {
    loadRedFlagData();
    loadTeamData(); // 
    
    selectedTagStudents = [];
    selectedTeamLeader = ''; // 
    selectedTeamMembers = []; // 
    
    // 입력 필드 초기화
    document.getElementById('redFlagStudentInput').value = '';
    document.getElementById('redFlagReason').value = '';
    document.getElementById('selectedStudentTags').innerHTML = '';
    
    // 팀 입력 초기화
    document.getElementById('teamLeaderInput').value = '';
    document.getElementById('teamMemberInput').value = '';
    document.getElementById('teamReason').value = '';
    document.getElementById('teamLeaderTag').innerHTML = '';
    document.getElementById('teamMemberTags').innerHTML = '';
    
    // 그룹 목록 렌더링
    renderRedFlagGroups();
    
    // 팀 목록 렌더링
    renderTeamList();
    
    // 기본 탭을 그룹으로 설정
    switchTab('group');
    
    document.getElementById('redFlagModal').style.display = 'flex';
}


// 모달 닫기
function closeRedFlagModal() {
    document.getElementById('redFlagModal').style.display = 'none';
    selectedTagStudents = [];
    
    // 통계 테이블 업데이트 (위반 표시 반영)
    renderStatistics();
}

// 모달 바깥 영역 클릭 시 닫기
document.addEventListener('click', function(e) {
    const modal = document.getElementById('redFlagModal');
    if (e.target === modal) {
        closeRedFlagModal();
    }
});


// ESC 키로 모달 닫기
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {

        // 동명이인 선택 팝업이 열려있으면 먼저 닫기
        const selectionOverlay = document.getElementById('studentSelectionOverlay');
        if (selectionOverlay) {
            selectionOverlay.remove();
            return;
        }
        closeRedFlagModal();
    }
});


// 학생 입력 키 이벤트 (Enter로 태그 추가)
function handleStudentInputKeydown(e) {
    handleStudentInput(e, {
        inputId: 'redFlagStudentInput',
        storageType: 'array',
        getStorage: () => selectedTagStudents,
        setStorage: (val) => selectedTagStudents.push(val),
        renderFn: renderSelectedTags,
        duplicateCheck: true,
        extraValidation: null,
        keepFocus: true
    });
}


// 입력된 이름으로 학생 후보 찾기
function findStudentCandidates(inputName) {
    const candidates = [];
    
    Object.keys(classData).forEach(cls => {
        if (cls === 'history' || cls === 'undefined') return;
        
        const students = classData[cls] || [];
        students.forEach(student => {
            // 정확히 일치하는 이름 찾기
            if (student.성명 === inputName) {
                const prevClass = student.이전학적반 || '';
                const displayName = `${student.성명}(${prevClass}반, ${student.성별})`;
                candidates.push({
                    name: student.성명,
                    prevClass: prevClass,
                    gender: student.성별,
                    currentClass: cls,
                    displayName: displayName
                });
            }
        });
    });
    
    return candidates;
}

// 동명이인 선택 UI 표시
function showStudentSelectionUI(candidates, onSelect) {
    // 기존 선택 UI가 있으면 제거
    const existing = document.getElementById('studentSelectionOverlay');
    if (existing) existing.remove();
    
    // 오버레이 생성
    const overlay = document.createElement('div');
    overlay.id = 'studentSelectionOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
    `;
    
    // 선택 박스 생성
    const selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
        background: white;
        padding: 25px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        width: 90%;
    `;
    
    selectionBox.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 15px; color: #333; font-size: 16px;">
            동명이인입니다. 학생을 선택하세요.
        </h3>
        <div id="candidateList"></div>
        <button id="cancelSelection" style="
            width: 100%;
            margin-top: 15px;
            padding: 10px;
            background: #757575;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        ">취소</button>
    `;
    
    const candidateList = selectionBox.querySelector('#candidateList');
    
    // 후보 버튼 생성
    candidates.forEach(candidate => {
        const [, currentClassNum] = candidate.currentClass.split('-');
        const button = document.createElement('button');
        button.style.cssText = `
            width: 100%;
            padding: 12px;
            margin-bottom: 8px;
            background: #f9f9f9;
            border: 2px solid #ddd;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            text-align: left;
            transition: all 0.2s;
        `;
        
        button.innerHTML = `
            <div style="font-weight: bold; color: #333; margin-bottom: 4px;">
                ${candidate.name} (${candidate.gender})
            </div>
            <div style="font-size: 12px; color: #666;">
                이전: ${candidate.prevClass}반 → 현재: ${currentClassNum}반
            </div>
        `;
        
        button.addEventListener('mouseenter', () => {
            button.style.background = '#e8f5e9';
            button.style.borderColor = '#4CAF50';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#f9f9f9';
            button.style.borderColor = '#ddd';
        });
        
        button.addEventListener('click', () => {
            overlay.remove();
            onSelect(candidate.displayName);
        });
        
        candidateList.appendChild(button);
    });
    
    // 취소 버튼 이벤트
    selectionBox.querySelector('#cancelSelection').addEventListener('click', () => {
        overlay.remove();
    });
    
    // 오버레이 클릭 시 닫기
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });

    
    overlay.appendChild(selectionBox);
    document.body.appendChild(overlay);
}




// 학생 이름 유효성 검사
function validateStudentName(inputValue) {
    // 모든 학생 순회하면서 매칭 확인
    let found = false;
    
    Object.keys(classData).forEach(cls => {
        if (cls === 'history' || cls === 'undefined') return;
        
        const students = classData[cls] || [];
        students.forEach(student => {
            const name = student.성명;
            const prevClass = student.이전학적반 || '';
            
            // 정확히 일치하거나, 동명이인 형식으로 일치
            if (inputValue === name || 
                inputValue === `${name}(${prevClass}반, ${student.성별})`) {
                found = true;
            }
        });
    });
    
    return found;
}

// 선택된 학생 태그 렌더링
function renderSelectedTags() {
    const container = document.getElementById('selectedStudentTags');
    container.innerHTML = '';
    
    selectedTagStudents.forEach((student, index) => {
        const tag = document.createElement('span');
        tag.className = 'student-tag';
        tag.innerHTML = `
            ${student}
            <span class="remove-tag" data-index="${index}">&times;</span>
        `;
        
        // 삭제 버튼 이벤트
        tag.querySelector('.remove-tag').addEventListener('click', () => {
            selectedTagStudents.splice(index, 1);
            renderSelectedTags();
        });
        
        container.appendChild(tag);
    });
}

// 그룹 추가
function addSeparationGroup() {
    if (selectedTagStudents.length < 2) {
        alert('최소 2명 이상의 학생을 선택해야 합니다.');
        return;
    }
    
    const reason = document.getElementById('redFlagReason').value.trim();
    
    const newGroup = {
        id: Date.now(),  // 고유 ID
        students: [...selectedTagStudents],
        reason: reason || '(사유 없음)'
    };
    
    separationGroups.push(newGroup);
    saveRedFlagData();
    
    // 입력 초기화
    selectedTagStudents = [];
    document.getElementById('redFlagStudentInput').value = '';
    document.getElementById('redFlagReason').value = '';
    document.getElementById('selectedStudentTags').innerHTML = '';
    
    // 목록 다시 렌더링
    renderRedFlagGroups();
    
}

// 그룹 삭제
function deleteSeparationGroup(groupId) {
    separationGroups = separationGroups.filter(g => g.id !== groupId);
    saveRedFlagData();
    renderRedFlagGroups();
}

// 그룹 목록 렌더링
function renderRedFlagGroups() {
    const container = document.getElementById('redFlagGroupList');
    container.innerHTML = '';
    
    if (separationGroups.length === 0) {
        return;  // CSS :empty 스타일이 적용됨
    }
    
    separationGroups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'group-item';
        
        // 위반 여부 체크
        const violation = checkGroupViolation(group);
        
        item.innerHTML = `
            <div class="group-info">
                <div class="group-students">${group.students.join(' ↔ ')}</div>
                <div class="group-reason">${group.reason}</div>
                <div class="group-status ${violation.hasViolation ? 'violation' : 'ok'}">
                    ${violation.hasViolation 
                        ? `⚠️ 같은 반: ${violation.details}` 
                        : '✓ 모두 다른 반'}
                </div>
            </div>
            <button class="delete-group" data-id="${group.id}">&times;</button>
        `;
        
        // 삭제 버튼 이벤트
        item.querySelector('.delete-group').addEventListener('click', () => {
            deleteSeparationGroup(group.id);
        });
        
        container.appendChild(item);
    });
}

// 그룹 내 위반 여부 체크 (같은 반에 있는 학생이 있는지)
function checkGroupViolation(group) {
    // 각 학생이 어느 반에 있는지 찾기
    const studentClasses = {};
    
    group.students.forEach(studentInput => {
        const classKey = findStudentClass(studentInput);
        if (classKey) {
            studentClasses[studentInput] = classKey;
        }
    });
    
    // 같은 반에 있는 학생 쌍 찾기
    const violations = [];
    const students = Object.keys(studentClasses);
    
    for (let i = 0; i < students.length; i++) {
        for (let j = i + 1; j < students.length; j++) {
            if (studentClasses[students[i]] === studentClasses[students[j]]) {
                const [, classNum] = studentClasses[students[i]].split('-');
                violations.push(`${classNum}반`);
            }
        }
    }
    
    return {
        hasViolation: violations.length > 0,
        details: [...new Set(violations)].join(', ')
    };
}

// 학생 이름으로 현재 반 찾기
function findStudentClass(studentInput) {
    // 이름에서 기본 이름 추출 (동명이인 형식 처리)
    const nameMatch = studentInput.match(/^(.+?)(?:\(|$)/);
    const baseName = nameMatch ? nameMatch[1] : studentInput;
    
    // 동명이인 형식인 경우 이전반, 성별도 추출
    const detailMatch = studentInput.match(/\((\d+)반, (남|여)\)/);
    
    let foundClass = null;
    
    Object.keys(classData).forEach(cls => {
        if (cls === 'history' || cls === 'undefined') return;
        
        const students = classData[cls] || [];
        students.forEach(student => {
            if (student.성명 === baseName) {
                // 동명이인 형식이면 추가 검증
                if (detailMatch) {
                    const prevClass = student.이전학적반 || '';
                    if (prevClass === detailMatch[1] && student.성별 === detailMatch[2]) {
                        foundClass = cls;
                    }
                } else {
                    foundClass = cls;
                }
            }
        });
    });
    
    return foundClass;
}

// 반별 위반 개수 계산
function calculateClassViolations() {
    const violations = {};  // { "3-1": 2, "3-2": 0, ... }
    
    // 모든 반 초기화
    Object.keys(classData).forEach(cls => {
        if (cls === 'history' || cls === 'undefined') return;
        violations[cls] = 0;
    });
    
    // 각 그룹별로 위반 체크
    separationGroups.forEach(group => {
        // 그룹 내 학생들이 어느 반에 있는지 매핑
        const studentClassMap = {};  // { "김철수": "3-1", "이영희": "3-1", ... }
        
        group.students.forEach(studentInput => {
            const cls = findStudentClass(studentInput);
            if (cls) {
                studentClassMap[studentInput] = cls;
            }
        });
        
        // 같은 반에 있는 쌍 찾기 → 해당 반의 위반 카운트 증가
        const students = Object.keys(studentClassMap);
        
        for (let i = 0; i < students.length; i++) {
            for (let j = i + 1; j < students.length; j++) {
                const class1 = studentClassMap[students[i]];
                const class2 = studentClassMap[students[j]];
                
                if (class1 === class2) {
                    // 같은 반에 있음 = 위반!
                    violations[class1] = (violations[class1] || 0) + 1;
                }
            }
        }
    });

    // 팀 위반 체크 추가
    separationTeams.forEach(team => {
        const leaderClass = findStudentClass(team.leader);
        if (!leaderClass) return;
        
        team.members.forEach(member => {
            const memberClass = findStudentClass(member);
            if (memberClass === leaderClass) {
                violations[leaderClass] = (violations[leaderClass] || 0) + 1;
            }
        });
    });
    
    return violations;
}


// 위반 상세 정보 생성
function getViolationDetails(cls) {
    const details = [];
    
    // 그룹 위반 체크
    separationGroups.forEach(group => {
        const studentClassMap = {};
        group.students.forEach(studentInput => {
            const studentCls = findStudentClass(studentInput);
            if (studentCls) {
                studentClassMap[studentInput] = studentCls;
            }
        });
        
        const students = Object.keys(studentClassMap);
        const sameClassStudents = students.filter(s => studentClassMap[s] === cls);
        
        if (sameClassStudents.length >= 2) {
            details.push(`[그룹] ${sameClassStudents.join(' ↔ ')}`);
        }
    });
    
    // 팀 위반 체크
    separationTeams.forEach(team => {
        const leaderClass = findStudentClass(team.leader);
        if (leaderClass !== cls) return;
        
        const violatingMembers = [];
        team.members.forEach(member => {
            const memberClass = findStudentClass(member);
            if (memberClass === cls) {
                violatingMembers.push(member);
            }
        });
        
        if (violatingMembers.length > 0) {
            details.push(`[1:N] ${team.leader} ↔ ${violatingMembers.join(', ')}`);
        }
    });
    
    return details.length > 0 ? details.join('\n') : '위반 없음';
}

// 툴팁 표시
function showViolationTooltip(event, text) {
    // 기존 툴팁 제거
    hideViolationTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'violation-tooltip';
    tooltip.id = 'violationTooltip';
    tooltip.textContent = text;
    
    document.body.appendChild(tooltip);
    
    // 위치 계산 (fixed 포지션 사용)
    const rect = event.target.getBoundingClientRect();
    tooltip.style.position = 'fixed';  // absolute → fixed로 변경
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    
    // 화면 밖으로 나가는 것 방지
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 오른쪽으로 넘치면 왼쪽으로 조정
    if (tooltipRect.right > viewportWidth - 10) {
        tooltip.style.left = (viewportWidth - tooltipRect.width - 10) + 'px';
    }
    
    // 아래로 넘치면 위로 표시
    if (tooltipRect.bottom > viewportHeight - 10) {
        tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
        
        // 화살표 위치도 변경 (아래에서 위로)
        tooltip.classList.add('tooltip-above');
    }
}

// 툴팁 숨기기
function hideViolationTooltip() {
    const tooltip = document.getElementById('violationTooltip');
    if (tooltip) {
        tooltip.remove();
    }
}