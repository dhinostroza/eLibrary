document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURACIÓN ---
    const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTarJH5D3w2ySFf-glomlh56NhP3AaoslrsWwvUboEFSk9TVKzZ52Cmu0zfDPp_yHTZdJSRBEZcfrjD/pub?output=csv'; // URL Actualizada
    const CREDENTIALS_FILE_PATH = 'credentials.txt';
    const RIS_NEWLINE_PLACEHOLDER = '|||';
    const LOGIN_LOG_KEY = 'bibliotecaLoginLog';
    const LOAN_STATUS_KEY_PREFIX = 'bibliotecaLoan_'; // Prefijo para claves de préstamo en localStorage

    // --- SINÓNIMOS ---
    const synonyms = {
        "cardio": ["cardio", "heart", "cardiac", "cardiovascular", "cardiología", "corazón"],
        "surgery": ["surgery", "surgical", "operative", "operation", "cirugía", "quirúrgico", "operación"],
        "nursing": ["nursing", "nurse", "nurses", "enfermería", "enfermera", "enfermero"],
        "renal": ["renal", "kidney", "nephrology", "riñón", "nefrología"],
        "ortho": ["ortho", "orthopaedic", "orthopedic", "musculoskeletal", "bone", "joint", "ortopedia", "ortopédico", "hueso", "articulación", "musculoesquelético"],
        "neuro": ["neuro", "neurology", "neurologic", "nervous system", "brain", "neurología", "neurológico", "nervioso", "cerebro"],
        "radiology": ["radiology", "imaging", "radiography", "radiographic", "x-ray", "ct", "mr", "mri", "ultrasound", "sonography", "imagen", "radiografía", "radiológico", "ultrasonido", "sonografía"],
        "pediatric": ["pediatric", "paediatric", "child", "infant", "childhood", "children", "pediatría", "pediátrico", "niño", "infancia", "infantil"],
        "obgyn": ["obgyn", "obstetric", "gynecology", "maternal", "maternity", "women's health", "newborn", "ginecología", "obstetricia", "materno", "recién nacido", "mujer"],
        "pharmacology": ["pharmacology", "drug", "meds", "medication", "farmacología", "fármaco", "medicamento"],
        "pathology": ["pathology", "disease", "disorder", "patología", "enfermedad"],
        "psychiatric": ["psychiatric", "mental health", "psiquiatría", "salud mental"],
        "anatomy": ["anatomy", "anatomía"],
        "physiology": ["physiology", "fisiología"],
        "dermatology": ["dermatology", "skin", "dermatología", "piel"],
        "oncology": ["oncology", "cancer", "oncología"],
        "hematology": ["hematology", "haematology", "blood", "hematología", "sangre"],
        "gastrointestinal": ["gastrointestinal", "gi", "digestive", "digestivo"],
        // Sinónimos de estado
        "prestado": ["prestado", "borrowed", "loaned"],
        "disponible": ["disponible", "available", "presente"],
        "ausente": ["ausente", "missing", "falta"]
    };

    // --- ESTADO GLOBAL ---
    let shelfSlots = []; // Datos originales + estado local
    let currentSource = 'none';
    let isLoggedIn = false;
    let activeFilter = 'all'; // Estado del filtro actual

    // --- ELEMENTOS DEL DOM (Declaración robusta) ---
    const loginContainer = document.getElementById('login-container');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-button');
    const loginErrorDiv = document.getElementById('login-error');
    const mainContentContainer = document.getElementById('main-content');
    const messageArea = document.getElementById('message-area');
    const messageText = document.getElementById('message-text');
    const closeMessageButton = document.getElementById('close-message-button');
    const sourceTypeSelector = document.getElementById('source-type');
    const csvLoaderDiv = document.getElementById('csv-loader');
    const csvFileInput = document.getElementById('csv-file');
    const sheetLoaderDiv = document.getElementById('sheet-loader');
    const loadSheetButton = document.getElementById('load-sheet-button');
    const sheetStatusSpan = document.getElementById('sheet-status');
    const loadingStatusDiv = document.getElementById('loading-status');
    const downloadBorrowsButton = document.getElementById('download-borrows-button');
    const downloadLoginsButton = document.getElementById('download-logins-button');
    const filterControls = document.getElementById('filter-controls');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const showAllButton = document.getElementById('show-all-button');
    const resultsContainer = document.getElementById('results-container');
    // Modal Elements
    const borrowModal = document.getElementById('borrow-modal');
    const borrowForm = document.getElementById('borrow-form');
    const borrowModalTitle = document.getElementById('borrow-modal-title');
    const borrowSerialNumberInput = document.getElementById('borrow-serial-number');
    const borrowerNameInput = document.getElementById('borrower-name');
    const loanDurationSelect = document.getElementById('loan-duration');
    const loanDurationOtherInput = document.getElementById('loan-duration-other');
    const borrowerIdInput = document.getElementById('borrower-id');
    const borrowerPhoneInput = document.getElementById('borrower-phone');
    const confirmBorrowButton = document.getElementById('confirm-borrow-button');
    const cancelBorrowButton = document.getElementById('cancel-borrow-button');

    // --- Funciones de Mensajes ---
    function showMessage(text, type = 'info', duration = 5000) { // types: info, success, warning, error
        if (!messageArea || !messageText) return;
        messageText.textContent = text;
        messageArea.className = 'message-area'; // Reset class
        if (type !== 'info') { messageArea.classList.add(type); }
        messageArea.style.display = 'flex';
        // Ocultar automáticamente después de 'duration' ms, excepto para errores
        if (type !== 'error' && duration > 0) {
            setTimeout(hideMessage, duration);
        }
    }
    function hideMessage() { if (messageArea) messageArea.style.display = 'none'; }
    if (closeMessageButton) closeMessageButton.addEventListener('click', hideMessage);


    // --- FUNCIONES DE LOGIN (Con Log) ---
    async function handleLogin() {
        if (!usernameInput || !passwordInput || !loginErrorDiv || !loginButton) { console.error("Login elements missing!"); return; }
        const enteredUsername = usernameInput.value.trim(); const enteredPassword = passwordInput.value;
        loginErrorDiv.textContent = ''; loginButton.disabled = true; loginButton.textContent = 'Verificando...';
        if (!enteredUsername || !enteredPassword) { loginErrorDiv.textContent = 'Usuario y contraseña requeridos.'; loginButton.disabled = false; loginButton.textContent = 'Ingresar'; return; }
        try {
            const response = await fetch(CREDENTIALS_FILE_PATH); if (!response.ok) throw new Error(`Fallo al cargar credentials.txt (${response.status})`);
            const credentialsText = await response.text(); const lines = credentialsText.trim().split('\n'); let foundMatch = false;
            for (const line of lines) { const trimmedLine = line.trim(); if (!trimmedLine) continue; const parts = trimmedLine.split(':'); if (parts.length < 2) continue; const storedUsername = parts[0]; const storedPassword = parts.slice(1).join(':'); if (enteredUsername === storedUsername && enteredPassword === storedPassword) { foundMatch = true; break; } }
            if (foundMatch) {
                console.log("LOGIN EXITOSO!"); isLoggedIn = true;
                try { const logEntry = { username: enteredUsername, timestamp: new Date().toISOString() }; const currentLog = JSON.parse(localStorage.getItem(LOGIN_LOG_KEY) || '[]'); currentLog.push(logEntry); localStorage.setItem(LOGIN_LOG_KEY, JSON.stringify(currentLog)); } catch (e) { console.error("Error registro login:", e); }
                if (loginContainer) loginContainer.style.display = 'none'; if (mainContentContainer) mainContentContainer.style.display = 'block'; if(resultsContainer) resultsContainer.innerHTML = `<p>Login exitoso. Selecciona fuente de datos.</p>`; hideMessage();
            } else { console.log("LOGIN FALLIDO"); showMessage('Usuario o contraseña incorrectos.', 'error', 0); isLoggedIn = false; } // Error persistente
        } catch (error) { console.error("Error login:", error); showMessage(`Error de sistema: ${error.message}`, 'error', 0); isLoggedIn = false; // Error persistente
        } finally { if (!isLoggedIn && loginButton) { loginButton.disabled = false; loginButton.textContent = 'Ingresar'; } }
    }

    // --- FUNCIONES DE CARGA Y PARSEO (Lee EstadoPrestamo, etc.) ---
    function parseCSVData(csvString) {
        return new Promise((resolve, reject) => {
            Papa.parse(csvString, { header: true, skipEmptyLines: true,
                complete: (results) => {
                     if (results.errors.length > 0) { console.warn("Errores parseo CSV:", results.errors); }
                    if (!results.data || results.data.length === 0) { reject(new Error("CSV vacío o inválido.")); return; }
                     const requiredHeaders = ['SerialNumber', 'IsPresent']; const actualHeaders = results.meta.fields;
                    if (!requiredHeaders.every(h => actualHeaders.includes(h))) { reject(new Error(`Faltan encabezados: ${requiredHeaders.join(', ')}`)); return; }
                     const processedData = results.data.map(row => { const isPresent = String(row.IsPresent||'').trim().toUpperCase() === 'TRUE' || String(row.IsPresent||'').trim() === '1'; const estadoPrestamo = String(row.EstadoPrestamo || '').trim().toUpperCase(); const isBorrowed = estadoPrestamo === 'PRESTADO' || estadoPrestamo === 'BORROWED'; const borrowerName = String(row.PrestadoA || '').trim(); const borrowDate = String(row.FechaPrestamo || '').trim(); const loanDuration = String(row.DuracionPrestamo || '').trim(); const borrowerId = String(row.CedulaID || '').trim(); const borrowerPhone = String(row.Telefono || '').trim();
                         return { serialNumber: String(row.SerialNumber || '').trim(), isPresent: isPresent,
                             // Datos originales de préstamo (serán comparados con localStorage)
                             originalIsBorrowed: isBorrowed, originalBorrowerName: borrowerName, originalBorrowDate: borrowDate,
                             // Campos que serán posiblemente sobreescritos por localStorage
                             isBorrowed: isBorrowed, borrowerName: borrowerName, borrowDate: borrowDate, loanDuration: loanDuration, borrowerId: borrowerId, borrowerPhone: borrowerPhone,
                             citationData: isPresent ? { title: String(row.Title || '').trim(), authors: String(row.Authors || '').split(';').map(a => a.trim()).filter(a => a), edition: String(row.Edition || '').trim(), volume: String(row.Volume || '').trim(), year: String(row.Year || '').trim(), publisher: String(row.Publisher || '').trim(), isbn: String(row.ISBN || '').trim(), notes: String(row.Notes || '').trim(), ris: String(row.RIS || '').replace(new RegExp(RIS_NEWLINE_PLACEHOLDER.replace(/\|/g, '\\|'), 'g'), '\n').trim(), ebookURL: String(row.EbookURL || '').trim(), nlmClassification: String(row.NLMClassification || '').trim(), lccClassification: String(row.LCCClassification || '').trim(), meshTerms: String(row.MeSHTerms || '').trim() } : null }; }).filter(slot => slot.serialNumber);
                    resolve(processedData); },
                error: (error) => { console.error("Error PapaParse:", error); reject(new Error(`Error fatal parseo CSV: ${error.message}`)); }
            });
        });
    }
    function mergeWithLocalStorage(loadedSlots) {
         return loadedSlots.map(slot => {
             const localKey = LOAN_STATUS_KEY_PREFIX + slot.serialNumber; const localDataString = localStorage.getItem(localKey); let statusConflict = false; let mergedSlot = {...slot}; // Copiar slot original
             if (localDataString) { try { const localData = JSON.parse(localDataString); console.log(`Local data for ${slot.serialNumber}:`, localData);
                    mergedSlot.isBorrowed = localData.isBorrowed; mergedSlot.borrowerName = localData.borrowerName || ""; mergedSlot.borrowDate = localData.borrowDate || ""; mergedSlot.loanDuration = localData.loanDuration || ""; mergedSlot.borrowerId = localData.borrowerId || ""; mergedSlot.borrowerPhone = localData.borrowerPhone || "";
                    // Comprobar conflicto SOLO si el libro está presente en el archivo fuente
                    if (slot.isPresent) { statusConflict = slot.originalIsBorrowed !== localData.isBorrowed; }
                 } catch (e) { console.error(`Error parsing localStorage ${slot.serialNumber}:`, e); localStorage.removeItem(localKey); } }
             mergedSlot.statusConflict = statusConflict; // Añadir flag de conflicto
             return mergedSlot; });
     }
    async function loadData(sourceFunction) {
        setLoadingStatus("Cargando datos..."); if(sheetStatusSpan) sheetStatusSpan.textContent = 'Cargando...'; hideMessage();
        try {
            const rawSlots = await sourceFunction(); // Llama a la función específica (loadFromCSV o loadFromSheet)
            shelfSlots = mergeWithLocalStorage(rawSlots);
            setLoadingStatus(`Cargados ${shelfSlots.length} registros.`); if(sheetStatusSpan) sheetStatusSpan.textContent = 'Cargado.'; if(searchInput) searchInput.value = '';
            applyCurrentFilters(); // Aplicar filtro activo al mostrar
            if(searchContainer) searchContainer.style.display = 'block';
            showMessage(`Datos cargados desde ${currentSource === 'csv' ? 'archivo CSV' : 'Google Sheet'}.`, "success");
        } catch (error) {
            console.error(`Error al cargar datos (${currentSource}):`, error);
            setLoadingStatus(`Error al cargar: ${error.message}`, true); if(sheetStatusSpan) sheetStatusSpan.textContent = 'Error.';
            if(resultsContainer) resultsContainer.innerHTML = `<p style="color: red;">Error al cargar datos: ${error.message}</p>`;
            if(searchContainer) searchContainer.style.display = 'none';
            showMessage(`Error al cargar desde ${currentSource === 'csv' ? 'archivo CSV' : 'Google Sheet'}.`, 'error', 0);
        }
    }
    async function loadDataFromCSVWrapper() { const file = csvFileInput.files[0]; if (!file) { throw new Error("No se seleccionó archivo CSV."); } const reader = new FileReader(); const promise = new Promise((resolve, reject) => { reader.onload = async (event) => { try { const data = await parseCSVData(event.target.result); currentSource = 'csv'; resolve(data); } catch (e) { reject(e); } }; reader.onerror = () => reject(reader.error); }); reader.readAsText(file); return promise; }
    async function loadDataFromSheetWrapper() { if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.startsWith('PEGA_AQUÍ')) { throw new Error("URL Google Sheet no configurada."); } const response = await fetch(GOOGLE_SHEET_URL); if (!response.ok) throw new Error(`Error fetch (${response.status})`); const csvData = await response.text(); if (!csvData || csvData.trim() === '') throw new Error("Respuesta Google Sheet vacía."); currentSource = 'sheet'; return parseCSVData(csvData); }


    // --- FUNCIONES DE VISUALIZACIÓN ---
    function setLoadingStatus(message, isError = false) { /* ... */ }
    function displayResults(resultsToDisplay) {
        // ... (Código completo de displayResults como en la respuesta anterior,
        //      asegúrate que usa slot.statusConflict para añadir la clase local-diff y el title) ...
        if (!resultsContainer) return; resultsContainer.innerHTML = ''; if (!isLoggedIn) { /* ... */ } /* ... */ if (resultsToDisplay.length === 0) { resultsContainer.innerHTML = '<p>No se encontraron coincidencias para los filtros/búsqueda actual.</p>'; return; } resultsToDisplay.sort((a, b) => { /* ... */ }); resultsToDisplay.forEach((slot, index) => { const resultDiv = document.createElement('div'); resultDiv.classList.add('result-item'); let statusText = ""; let statusClass = ""; let mainClass = ""; let borrowInfoHtml = ""; let actionButtonHtml = ""; if (!slot.isPresent) { statusText = "Ausente"; statusClass = "missing"; mainClass = "missing"; } else if (slot.isBorrowed) { statusText = "PRESTADO"; statusClass = "borrowed"; mainClass = "borrowed"; borrowInfoHtml = `<div class="borrow-info">Prestado a: ${slot.borrowerName || '??'}<br>Fecha: ${slot.borrowDate || '??'}<br>Duración: ${slot.loanDuration || '??'}<br>Cédula/ID: ${slot.borrowerId || '??'}<br>Teléfono: ${slot.borrowerPhone || '??'}</div>`; actionButtonHtml = `<button class="return-button" data-serial="${slot.serialNumber}">Registrar Devolución</button>`; } else { statusText = "Disponible"; statusClass = "present"; mainClass = "present"; actionButtonHtml = `<button class="borrow-button" data-serial="${slot.serialNumber}">Registrar Préstamo</button>`; } resultDiv.classList.add(mainClass); let statusConflictIndicator = slot.statusConflict ? ' local-diff' : ''; let statusTitle = slot.statusConflict ? ' title="Estado actualizado localmente. Actualizar archivo maestro."' : ''; let content = `<div class="serial-number">Nº Serie: ${slot.serialNumber || 'N/A'} ${actionButtonHtml}</div>`; content += `<div class="status ${statusClass}${statusConflictIndicator}"${statusTitle}>Estado: ${statusText}</div>`; content += borrowInfoHtml; if (slot.isPresent && slot.citationData) { const citation = slot.citationData; let authorsHtml = citation.authors && citation.authors.length > 0 ? citation.authors.join('; ') : 'N/A'; let yearHtml = citation.year || 'N/A'; let notesHtml = citation.notes ? `<p><strong>Notas:</strong> ${citation.notes}</p>` : ''; let isbnHtml = citation.isbn ? `<p><strong>ISBN:</strong> ${citation.isbn}</p>` : ''; content += `<h3>${citation.title || 'Título no disponible'}</h3><p><strong>Autor(es)/Editor:</strong> ${authorsHtml}</p><p><strong>Año:</strong> ${yearHtml}</p>${citation.edition ? `<p><strong>Edición:</strong> ${citation.edition}</p>` : ''}${citation.volume ? `<p><strong>Volumen:</strong> ${citation.volume}</p>` : ''}${citation.publisher ? `<p><strong>Editorial:</strong> ${citation.publisher}</p>` : ''}${isbnHtml}`; if (isLoggedIn && citation.ebookURL && !slot.isBorrowed) { content += `<p><strong>Versión Electrónica:</strong> <a href="${citation.ebookURL}" target="_blank" rel="noopener noreferrer">Acceder al libro</a></p>`; } else if (isLoggedIn && citation.ebookURL && slot.isBorrowed) { content += `<p><strong>Versión Electrónica:</strong> <a href="${citation.ebookURL}" target="_blank" rel="noopener noreferrer" style="color:#999; text-decoration: line-through; pointer-events: none; cursor: not-allowed;">Acceder al libro (Prestado)</a></p>`; } content += notesHtml; let preContent = ""; if (citation.nlmClassification) { preContent += `NLM: ${citation.nlmClassification}\n`; } if (citation.lccClassification) { preContent += `LCC: ${citation.lccClassification}\n`; } if (citation.meshTerms) { preContent += `MeSH: ${citation.meshTerms}\n`; } if (preContent !== "") { preContent += "\n"; } if (citation.ris) { preContent += citation.ris; } else if (preContent === "") { preContent = "(No hay RIS ni Clasificación disponible)";} if (preContent.trim() !== "(No hay RIS ni Clasificación disponible)") { content += `<span class="ris-toggle" data-slot-serial="${slot.serialNumber}">Mostrar/Ocultar RIS y Clasificación</span><pre class="hidden">${preContent}</pre>`; } } else if (!slot.isPresent) { content += `<p>Posición vacía.</p>`; } else if (slot.isBorrowed && !slot.citationData) { content += `<p>Libro (sin datos) prestado.</p>`;} resultDiv.innerHTML = content; resultsContainer.appendChild(resultDiv); if (slot.isPresent && slot.citationData) { const borrowBtn = resultDiv.querySelector('.borrow-button'); const returnBtn = resultDiv.querySelector('.return-button'); const preElement = resultDiv.querySelector('pre'); const toggleButton = resultDiv.querySelector('.ris-toggle'); if (borrowBtn) { borrowBtn.addEventListener('click', openBorrowModal); } if (returnBtn) { returnBtn.addEventListener('click', handleReturnClick); } if(preElement && toggleButton) { preElement.addEventListener('click', () => { navigator.clipboard.writeText(preElement.textContent).then(() => showMessage(`Datos RIS/Clasif. Nº ${slot.serialNumber} copiados!`,'success')).catch(err => { console.error('Error copia RIS/Clasif:', err); showMessage('Error copia RIS/Clasif.','error'); }); }); toggleButton.addEventListener('click', () => preElement.classList.toggle('hidden')); } } });
        // displayedSlots = resultsToDisplay; // Ya no es necesario globalmente si filtramos shelfSlots
    }


    // --- FUNCIONES PRÉSTAMO/DEVOLUCIÓN (Usan Modal y localStorage) ---
    function openBorrowModal(event) { if (!borrowModal || !borrowSerialNumberInput || !borrowModalTitle || !borrowForm) { showMessage("Error: Modal no encontrado.", "error"); return; } const serialNumber = event.target.dataset.serial; borrowSerialNumberInput.value = serialNumber; borrowModalTitle.textContent = `Registrar Préstamo Libro Nº ${serialNumber}`; borrowForm.reset(); loanDurationOtherInput.style.display = 'none'; borrowModal.showModal(); }
    function handleConfirmBorrow(event) { event.preventDefault(); if (!borrowSerialNumberInput || !borrowerNameInput || !loanDurationSelect || !loanDurationOtherInput || !borrowerIdInput || !borrowerPhoneInput) return; const serialNumber = borrowSerialNumberInput.value; const borrowerName = borrowerNameInput.value.trim(); let loanDuration = loanDurationSelect.value; const loanDurationOther = loanDurationOtherInput.value.trim(); const borrowerId = borrowerIdInput.value.trim(); const borrowerPhone = borrowerPhoneInput.value.trim(); if (!borrowerName) { showMessage("Nombre prestatario requerido.", "warning"); return; } if (loanDuration === "Otro") { if (!loanDurationOther) { showMessage("Especifica duración.", "warning"); return; } loanDuration = loanDurationOther; } if (!loanDuration) { showMessage("Selecciona duración.", "warning"); return; } const slotIndex = shelfSlots.findIndex(s => s.serialNumber === serialNumber); if (slotIndex > -1) { const today = new Date().toISOString().split('T')[0]; const localKey = LOAN_STATUS_KEY_PREFIX + serialNumber; const localData = { isBorrowed: true, borrowerName, borrowDate: today, loanDuration, borrowerId, borrowerPhone }; try { localStorage.setItem(localKey, JSON.stringify(localData)); console.log(`Préstamo guardado localmente ${serialNumber}`); shelfSlots[slotIndex] = {...shelfSlots[slotIndex], ...localData, statusConflict: true }; applyCurrentFilters(); showMessage(`¡Recuerda Actualizar! Nº ${serialNumber} prestado a '${borrowerName}'. Actualiza archivo maestro.`, "warning", 10000); } catch (e) { console.error("Error localStorage (borrow):", e); showMessage("Error guardando localmente.", "error"); } } else { showMessage(`Error: Libro Nº ${serialNumber} no encontrado.`, "error"); } if (borrowModal) borrowModal.close(); }
    function handleReturnClick(event) { const serialNumber = event.target.dataset.serial; if (confirm(`¿Confirmar devolución libro Nº ${serialNumber}?`)) { const slotIndex = shelfSlots.findIndex(s => s.serialNumber === serialNumber); const localKey = LOAN_STATUS_KEY_PREFIX + serialNumber; if (slotIndex > -1) { const localData = { isBorrowed: false, borrowerName: "", borrowDate: "", loanDuration: "", borrowerId: "", borrowerPhone: "" }; try { localStorage.setItem(localKey, JSON.stringify(localData)); console.log(`Devolución guardada localmente ${serialNumber}`); shelfSlots[slotIndex] = {...shelfSlots[slotIndex], ...localData, statusConflict: shelfSlots[slotIndex].originalIsBorrowed }; applyCurrentFilters(); showMessage(`¡Recuerda Actualizar! Nº ${serialNumber} marcado como devuelto. Actualiza archivo maestro.`, "warning", 10000); } catch (e) { console.error("Error localStorage (return):", e); showMessage("Error guardando localmente.", "error"); shelfSlots[slotIndex] = {...shelfSlots[slotIndex], ...localData, statusConflict: shelfSlots[slotIndex].originalIsBorrowed }; applyCurrentFilters(); } } } }


    // --- FUNCIONES DE DESCARGA ---
    function escapeCsvValue(value) { if (value === null || value === undefined) { return ""; } const stringValue = String(value); if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) { return `"${stringValue.replace(/"/g, '""')}"`; } return stringValue; }
    function downloadBorrowLog() { if (!isLoggedIn) { showMessage("Inicia sesión.", "error"); return; } if (shelfSlots.length === 0) { showMessage("Carga datos.", "warning"); return; } const borrowedBooks = shelfSlots.filter(slot => slot.isBorrowed && slot.isPresent); if (borrowedBooks.length === 0) { showMessage("No hay libros prestados.", "info"); return; } let csvContent = `"Nº Serie","Título","Prestado A","Fecha Préstamo","Duración","Cédula/ID","Teléfono"\n`; borrowedBooks.forEach(slot => { const title = slot.citationData ? slot.citationData.title : "(Datos no disp.)"; const row = [ slot.serialNumber, title, slot.borrowerName, slot.borrowDate, slot.loanDuration, slot.borrowerId, slot.borrowerPhone ].map(escapeCsvValue).join(','); csvContent += row + '\n'; }); triggerCsvDownload(csvContent, 'prestamos_activos.csv'); showMessage("Archivo préstamos generado.", "success"); }
    function downloadLoginLog() { if (!isLoggedIn) { showMessage("Inicia sesión.", "error"); return; } try { const logString = localStorage.getItem(LOGIN_LOG_KEY); const logData = JSON.parse(logString || '[]'); if (logData.length === 0) { showMessage("No hay registros de acceso.", "info"); return; } let csvContent = `"Usuario","Fecha y Hora (ISO)"\n`; logData.forEach(entry => { const row = [entry.username, entry.timestamp].map(escapeCsvValue).join(','); csvContent += row + '\n'; }); triggerCsvDownload(csvContent, 'log_accesos.csv'); showMessage("Log de accesos generado.", "success"); } catch (error) { console.error("Error log accesos:", error); showMessage("Error al obtener log de accesos.", "error"); } }
    function triggerCsvDownload(csvContent, filename) { try { const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); if (link.download !== undefined) { const url = URL.createObjectURL(blob); link.setAttribute("href", url); link.setAttribute("download", filename); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); } else { throw new Error("Descarga directa no soportada."); } } catch(e){ console.error("Error descarga:",e); showMessage("Error al intentar descargar el archivo.", "error");}}


    // --- FUNCIONES DE BÚSQUEDA Y FILTRADO ---
    function getSearchTermsWithSynonyms(term) { const lowerTerm = term.toLowerCase(); for (const key in synonyms) { if (synonyms[key].includes(lowerTerm)) { return synonyms[key]; } } return [lowerTerm]; }
    function filterAndSearchSlots() {
        if (!isLoggedIn || shelfSlots.length === 0) return; // No hacer nada si no hay datos o login

        // 1. Aplicar Filtro Rápido
        let filteredByStatus = shelfSlots;
        switch (activeFilter) {
            case 'available': filteredByStatus = shelfSlots.filter(slot => slot.isPresent && !slot.isBorrowed); break;
            case 'borrowed': filteredByStatus = shelfSlots.filter(slot => slot.isPresent && slot.isBorrowed); break;
            case 'missing': filteredByStatus = shelfSlots.filter(slot => !slot.isPresent); break;
            case 'all': default: filteredByStatus = shelfSlots; break; // 'all' u otro -> mostrar todos
        }

        // 2. Aplicar Término de Búsqueda (si existe)
        const searchTermRaw = searchInput ? searchInput.value.trim() : "";
        if (!searchTermRaw) {
            displayResults(filteredByStatus); // Mostrar solo filtrados por estado
            return;
        }

        const termsToMatch = getSearchTermsWithSynonyms(searchTermRaw);
        console.log("Filtrando por estado:", activeFilter, "y buscando términos:", termsToMatch);

        const finalResults = filteredByStatus.filter(slot => {
            // Comprobar Serial Number (búsqueda directa, ignora filtro rápido si coincide)
            if (slot.serialNumber && slot.serialNumber.toLowerCase() === searchTermRaw.toLowerCase()) return true;

            // Comprobar estado (si se busca explícitamente)
            const lowerSearch = searchTermRaw.toLowerCase();
             if ((lowerSearch === "prestado" || lowerSearch === "borrowed") && slot.isBorrowed && slot.isPresent) return true; // Solo si está presente y prestado
             if ((lowerSearch === "disponible" || lowerSearch === "available") && slot.isPresent && !slot.isBorrowed) return true;
             if ((lowerSearch === "ausente" || lowerSearch === "missing") && !slot.isPresent) return true;

            // Comprobar otros campos con sinónimos
            let combinedText = slot.borrowerName ? slot.borrowerName.toLowerCase() : ""; // Empezar con prestatario
            if (slot.isPresent && slot.citationData) {
                const cit = slot.citationData;
                combinedText += " " + [ cit.title || "", (cit.authors || []).join(" "), cit.notes || "", cit.publisher || "", cit.nlmClassification || "", cit.lccClassification || "", cit.meshTerms || "" ].join(" ").toLowerCase();
            }
            return termsToMatch.some(term => combinedText.includes(term));
        });

        displayResults(finalResults);
    }
    // Función wrapper para simplificar llamadas
    function applyCurrentFilters() { filterAndSearchSlots(); }


    // --- EVENT LISTENERS (Con verificaciones y delegación si es necesario) ---
    function safelyAddListener(element, eventType, handler, elementName) { if (element) { element.addEventListener(eventType, handler); } else { console.error(`Error Crítico: Elemento #${elementName} no encontrado. Listener para '${eventType}' NO añadido.`); } }

    safelyAddListener(loginButton, 'click', handleLogin, 'login-button');
    safelyAddListener(passwordInput, 'keypress', (event) => { if (event.key === 'Enter') { handleLogin(); } }, 'password');
    safelyAddListener(sourceTypeSelector, 'change', (event) => {
        const selectedValue = event.target.value;
        if (csvLoaderDiv) csvLoaderDiv.style.display = selectedValue === 'csv' ? 'block' : 'none';
        if (sheetLoaderDiv) sheetLoaderDiv.style.display = selectedValue === 'sheet' ? 'block' : 'none';
        if (selectedValue === 'csv' && csvLoaderDiv) { /* No hacer nada extra */ }
        else if (selectedValue === 'sheet' && sheetLoaderDiv) { /* No hacer nada extra */ }
        else if (selectedValue !== 'none') { console.warn("Contenedor de carga no encontrado para:", selectedValue); }
        if (currentSource !== selectedValue && selectedValue !== 'none') { shelfSlots = []; if(resultsContainer) resultsContainer.innerHTML = `<p>Carga datos de '${selectedValue}'.</p>`; if(searchContainer) searchContainer.style.display = 'none'; setLoadingStatus(''); if(sheetStatusSpan) sheetStatusSpan.textContent = ''; if(csvFileInput) csvFileInput.value = ''; currentSource = 'none'; }
        else if (selectedValue === 'none') { if (csvLoaderDiv) csvLoaderDiv.style.display = 'none'; if (sheetLoaderDiv) sheetLoaderDiv.style.display = 'none'; shelfSlots = []; if(resultsContainer) resultsContainer.innerHTML = `<p>Selecciona fuente y carga.</p>`; if(searchContainer) searchContainer.style.display = 'none'; setLoadingStatus(''); if(sheetStatusSpan) sheetStatusSpan.textContent = ''; currentSource = 'none'; }
    }, 'source-type');
    safelyAddListener(csvFileInput, 'change', () => loadData(loadDataFromCSVWrapper), 'csv-file'); // Usar wrapper
    safelyAddListener(loadSheetButton, 'click', () => loadData(loadDataFromSheetWrapper), 'load-sheet-button'); // Usar wrapper
    safelyAddListener(searchButton, 'click', applyCurrentFilters, 'search-button'); // Usar filtro combinado
    safelyAddListener(searchInput, 'keypress', (event) => { if (event.key === 'Enter') { applyCurrentFilters(); } }, 'search-input'); // Usar filtro combinado
    safelyAddListener(showAllButton, 'click', () => { if (isLoggedIn && shelfSlots.length > 0) { if(searchInput) searchInput.value = ''; activeFilter = 'all'; const filterButtons = filterControls?.querySelectorAll('.filter-button'); filterButtons?.forEach(btn => btn.classList.remove('active-filter')); filterControls?.querySelector('[data-filter="all"]')?.classList.add('active-filter'); displayResults(shelfSlots); } else if (!isLoggedIn) { showMessage("Ingresa primero.", "warning"); } else { showMessage("No hay datos cargados.", "info"); } }, 'show-all-button');
    safelyAddListener(downloadBorrowsButton, 'click', downloadBorrowLog, 'download-borrows-button');
    safelyAddListener(downloadLoginsButton, 'click', downloadLoginLog, 'download-logins-button');

    // Listeners para Modal
    if (borrowForm) safelyAddListener(borrowForm, 'submit', handleConfirmBorrow, 'borrow-form');
    if (cancelBorrowButton) safelyAddListener(cancelBorrowButton, 'click', () => { if (borrowModal) borrowModal.close(); }, 'cancel-borrow-button');
    if (loanDurationSelect) safelyAddListener(loanDurationSelect, 'change', () => { if (loanDurationOtherInput) { loanDurationOtherInput.style.display = loanDurationSelect.value === 'Otro' ? 'inline-block' : 'none'; if(loanDurationSelect.value !== 'Otro') loanDurationOtherInput.value = '';} }, 'loan-duration');

     // Listeners para Filtros Rápidos (Usando delegación de eventos en el contenedor)
     if (filterControls) {
         safelyAddListener(filterControls, 'click', (e) => {
             if (e.target && e.target.classList.contains('filter-button')) {
                 if (!isLoggedIn || shelfSlots.length === 0) { showMessage("Carga los datos primero.", "warning"); return; }
                 activeFilter = e.target.dataset.filter || 'all'; // Guardar filtro activo
                 filterControls.querySelectorAll('.filter-button').forEach(btn => btn.classList.remove('active-filter'));
                 e.target.classList.add('active-filter');
                 applyCurrentFilters(); // Aplicar filtros y búsqueda actual
             }
         }, 'filter-controls');
     } else { console.error("Elemento #filter-controls no encontrado."); }

}); // Fin de DOMContentLoaded