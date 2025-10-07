/**
 * @file script.js
 * @description Main logic for the Line Walk Through application (V4 - With Summary Sheet & Auditor).
 */

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 1. Variabel Global dan Referensi DOM
    // =========================================================================
    const STORAGE_KEY = 'lineWalkThroughData';
    const TOTAL_PAIRS = 20;
    let currentModalAction = { onConfirm: null, onCancel: null };
    
    // URL Google Apps Script Web App (ganti dengan URL deploy Anda)
    const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx05PeKZfdSM6qSNa9tSFpqcjeBrckNQ8KdWDcKOXZ_t4zlek7ycCrx6xXOxfstwH7grw/exec';

    const DOMElements = {
        // Form Elements
        auditor: document.getElementById('auditor'),
        validationCategory: document.getElementById('validation-category'),
        styleNumberInput: document.getElementById('style-number'),
        autocompleteResults: document.getElementById('autocomplete-results'),
        model: document.getElementById('model'),
        line: document.getElementById('line'),
        
        // Data Entry/Table
        dataEntryBody: document.getElementById('data-entry-body'),
        saveButton: document.getElementById('save-button'),
        
        // Saved Files
        savedFilesList: document.getElementById('saved-files-list'),
        
        // Modal
        modal: document.getElementById('app-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        modalConfirmBtn: document.getElementById('modal-confirm-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
    
       // TAMBAHAN BARU UNTUK OVERLAY
        loadingOverlay: document.getElementById('loading-overlay'), 
    };

    // =========================================================================
    // 2. FUNGSI INISIALISASI APLIKASI
    // =========================================================================
    
    function initializeApp() {
        populateLineDropdown();
        generateDataEntryRows();
        setupEventListeners();
        renderSavedFiles();
    }

    function populateLineDropdown() {
        const lineSelect = DOMElements.line;
        if (lineSelect.options.length > 1) return;
        for (let i = 101; i <= 116; i++) lineSelect.add(new Option(i, i));
        for (let i = 201; i <= 216; i++) lineSelect.add(new Option(i, i));
    }

    function generateDataEntryRows() {
        const tbody = DOMElements.dataEntryBody;
        tbody.innerHTML = '';
        for (let i = 1; i <= TOTAL_PAIRS; i++) {
            const tr = document.createElement('tr');
            tr.dataset.pairNumber = i;
            tr.dataset.photos = '[]';
            tr.dataset.defects = '[]';
            tr.innerHTML = `
                <td class="col-pair">${i}</td>
                <td class="col-status">
                    <select class="status-select">
                        <option value="">Pilih</option>
                        <option value="OK">OK</option>
                        <option value="NG">NG</option>
                    </select>
                </td>
                <td class="col-defect">
                    <div class="defect-input-container disabled">
                        <div class="defect-tags-wrapper">
                            <span class="placeholder-text">Pilih 'NG' untuk mengisi</span>
                        </div>
                    </div>
                </td>
                <td class="col-photo">
                    <div class="photo-container">
                        <div class="photo-gallery"></div>
                        <span class="photo-feedback">Belum ada foto.</span>
                        <button class="add-photo-btn" style="display:none;">+ Tambah Foto</button>
                        <input type="file" accept="image/*" class="hidden-file-input" multiple style="display:none;">
                    </div>
                </td>
                <td class="col-action">
                    <button class="table-action-btn delete-row-btn" title="Hapus Data Baris Ini">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        }
    }

    // =========================================================================
    // 3. PENGATURAN EVENT LISTENERS
    // =========================================================================
    
    function setupEventListeners() {
        DOMElements.styleNumberInput.addEventListener('input', handleAutocompleteInput);
        DOMElements.autocompleteResults.addEventListener('click', handleAutocompleteSelect);
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-container')) {
                DOMElements.autocompleteResults.style.display = 'none';
            }
        });
        
        DOMElements.dataEntryBody.addEventListener('change', handleTableChange);
        DOMElements.dataEntryBody.addEventListener('click', handleTableClick);
        
        DOMElements.saveButton.addEventListener('click', handleSaveValidation);
        DOMElements.modalConfirmBtn.addEventListener('click', () => currentModalAction.onConfirm?.());
        DOMElements.modalCancelBtn.addEventListener('click', () => currentModalAction.onCancel?.());
        
        DOMElements.savedFilesList.addEventListener('click', handleSavedFilesActions);
    }

    // =========================================================================
    // 4. HANDLER FORM INPUT (Autocomplete)
    // =========================================================================
    
    function handleAutocompleteInput(e) {
        const value = e.target.value.toLowerCase();
        const resultsContainer = DOMElements.autocompleteResults;
        resultsContainer.innerHTML = '';
        
        if (value.length < 1) {
            resultsContainer.style.display = 'none';
            return;
        }
        
        const filteredKeys = Object.keys(styleModelMap).filter(key => key.toLowerCase().includes(value));
        
        if (filteredKeys.length > 0) {
            filteredKeys.forEach(key => {
                const item = document.createElement('div');
                item.innerHTML = key.replace(new RegExp(value, 'gi'), `<span class="highlight">${value}</span>`);
                item.dataset.value = key;
                resultsContainer.appendChild(item);
            });
            resultsContainer.style.display = 'block';
        } else {
            resultsContainer.style.display = 'none';
        }
    }

    function handleAutocompleteSelect(e) {
        const target = e.target.closest('div[data-value]');
        if (target) {
            const selectedStyle = target.dataset.value;
            DOMElements.styleNumberInput.value = selectedStyle;
            DOMElements.model.value = styleModelMap[selectedStyle] || '';
            DOMElements.autocompleteResults.style.display = 'none';
        }
    }

    // =========================================================================
    // 5. HANDLER TABEL (Status, Defect, Foto)
    // =========================================================================

    function handleTableChange(e) {
        const target = e.target;

        if (target.classList.contains('status-select')) {
            const tr = target.closest('tr');
            const addPhotoButton = tr.querySelector('.add-photo-btn');
            const defectContainer = tr.querySelector('.defect-input-container');
            
            target.classList.add('status-selected');
            target.classList.toggle('status-ok', target.value === 'OK');
            target.classList.toggle('status-ng', target.value === 'NG');

            if (target.value === 'NG') {
                defectContainer.classList.replace('disabled', 'enabled');
                defectContainer.querySelector('.placeholder-text').textContent = 'Klik untuk pilih defect...';
                addPhotoButton.style.display = 'block';
            } else {
                defectContainer.classList.replace('enabled', 'disabled');
                defectContainer.querySelector('.placeholder-text').textContent = "Pilih 'NG' untuk mengisi";
                addPhotoButton.style.display = 'none';
                resetDefectsForRow(tr);
                resetPhotosForRow(tr);
            }
        }

        if (target.classList.contains('hidden-file-input')) {
            handleImageUpload(e);
        }
    }

    function handleTableClick(e) {
        const target = e.target;
        const tr = target.closest('tr');

        if (!tr) return;

        if (target.classList.contains('add-photo-btn')) {
            const fileInput = tr.querySelector('.hidden-file-input');
            fileInput.removeAttribute('capture');
            fileInput.click();
        } 
        else if (target.classList.contains('remove-photo-btn')) {
            const photoIndex = parseInt(target.dataset.index);
            removePhoto(tr, photoIndex);
        } 
        else if (target.classList.contains('delete-row-btn')) {
            showModal({
                title: 'Konfirmasi Hapus',
                body: `<p>Hapus data inspeksi <strong>Pair #${tr.dataset.pairNumber}</strong>?</p>`,
                confirmText: 'Ya, Hapus',
                onConfirm: () => { resetRow(tr); hideModal(); }
            });
        } 
        else if (target.closest('.defect-input-container.enabled')) {
            showDefectSelectionModal(tr);
        }
    }

    function handleImageUpload(e) {
        const files = e.target.files;
        if (!files.length) return;
        const tr = e.target.closest('tr');

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64String = event.target.result;
                let photos = JSON.parse(tr.dataset.photos);
                photos.push({ name: file.name, data: base64String });
                tr.dataset.photos = JSON.stringify(photos);
                updatePhotoGallery(tr);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    }

    function updatePhotoGallery(tr) {
        const gallery = tr.querySelector('.photo-gallery');
        const feedback = tr.querySelector('.photo-feedback');
        const photos = JSON.parse(tr.dataset.photos);
        gallery.innerHTML = '';

        photos.forEach((photo, index) => {
            gallery.innerHTML += `
                <div class="thumbnail-wrapper">
                    <img src="${photo.data}" class="thumbnail-img" alt="thumbnail">
                    <button class="remove-photo-btn" data-index="${index}">×</button>
                </div>
            `;
        });
        feedback.textContent = photos.length > 0 ? `${photos.length} foto diunggah.` : 'Belum ada foto.';
    }

    function removePhoto(tr, index) {
        let photos = JSON.parse(tr.dataset.photos);
        photos.splice(index, 1);
        tr.dataset.photos = JSON.stringify(photos);
        updatePhotoGallery(tr);
    }
    
    function resetRow(tr) {
        const statusSelect = tr.querySelector('.status-select');
        statusSelect.value = "";
        statusSelect.className = 'status-select';
        
        tr.querySelector('.defect-input-container').classList.replace('enabled', 'disabled');
        tr.querySelector('.add-photo-btn').style.display = 'none';

        resetDefectsForRow(tr);
        resetPhotosForRow(tr);
    }

    function resetDefectsForRow(tr) {
        tr.dataset.defects = '[]';
        updateDefectTags(tr);
    }

    function resetPhotosForRow(tr) {
        tr.dataset.photos = '[]';
        updatePhotoGallery(tr);
    }

    function showDefectSelectionModal(tr) {
        const currentDefects = JSON.parse(tr.dataset.defects || '[]');
        let optionsHTML = defectTypes.map(defect => `
            <label>
                <input type="checkbox" value="${defect}" ${currentDefects.includes(defect) ? 'checked' : ''}>
                ${defect}
            </label>
        `).join('');
        
        const modalBodyHTML = `
            <div id="defect-selection-modal">
                <input type="text" class="search-bar" placeholder="Cari tipe defect...">
                <div class="options-container">${optionsHTML}</div>
            </div>`;
        
        showModal({
            title: `Pilih Defect untuk Pair #${tr.dataset.pairNumber}`,
            body: modalBodyHTML,
            confirmText: 'Simpan Pilihan',
            onConfirm: () => {
                const selected = [];
                document.querySelectorAll('#defect-selection-modal input:checked').forEach(cb => selected.push(cb.value));
                tr.dataset.defects = JSON.stringify(selected);
                updateDefectTags(tr);
                hideModal();
            },
        });
        
        document.querySelector('#defect-selection-modal .search-bar').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('#defect-selection-modal label').forEach(label => {
                const matches = label.textContent.trim().toLowerCase().includes(searchTerm);
                label.style.display = matches ? 'flex' : 'none';
            });
        });
    }

    function updateDefectTags(tr) {
        const wrapper = tr.querySelector('.defect-tags-wrapper');
        const defects = JSON.parse(tr.dataset.defects || '[]');
        wrapper.innerHTML = '';
        
        if (defects.length > 0) {
            defects.forEach(defect => {
                const tag = document.createElement('span');
                tag.className = 'defect-tag';
                tag.textContent = defect;
                wrapper.appendChild(tag);
            });
        } else {
            const placeholder = document.createElement('span');
            placeholder.className = 'placeholder-text';
            placeholder.textContent = tr.querySelector('.status-select').value === 'NG' ? 'Klik untuk pilih defect...' : "Pilih 'NG' untuk mengisi";
            wrapper.appendChild(placeholder);
        }
    }
    
    // =========================================================================
    // 6. FUNGSI SIMPAN & MANAJEMEN DATA LOKAL
    // =========================================================================

    function handleSaveValidation() {
        // Validasi Auditor
        if (!DOMElements.auditor.value.trim()) {
            return alert('Harap isi nama Auditor.');
        }
        
        // Validasi Header
        if (!DOMElements.validationCategory.value || !DOMElements.styleNumberInput.value || !DOMElements.line.value) {
            return alert('Harap lengkapi semua informasi di bagian atas (Kategori, Style, Line).');
        }
        
        // Validasi NG tanpa Defect
        for (const tr of DOMElements.dataEntryBody.querySelectorAll('tr')) {
            const status = tr.querySelector('.status-select').value;
            const defects = JSON.parse(tr.dataset.defects || '[]');
            if (status === 'NG' && defects.length === 0) {
                return alert(`Error: Pair #${tr.dataset.pairNumber} berstatus NG tetapi belum ada tipe defect yang dipilih. Data tidak dapat disimpan.`);
            }
        }
        
        // Validasi Kelengkapan
        const inspectedCount = Array.from(document.querySelectorAll('.status-select')).filter(s => s.value !== "").length;
        if (inspectedCount < TOTAL_PAIRS) {
            showModal({
                title: 'Konfirmasi Penyimpanan',
                body: `<p>Inspeksi baru dilakukan pada <strong>${inspectedCount} dari ${TOTAL_PAIRS} pairs</strong>.<br>Apakah Anda tetap ingin menyimpan data ini?</p>`,
                confirmText: 'Lanjutkan',
                onConfirm: () => { hideModal(); saveData(); }
            });
        } else {
            saveData();
        }
    }

// GANTI FUNGSI saveData() ANDA (YANG LAMA) DENGAN KODE BERIKUT INI:

async function saveData() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
    
    const headerData = {
        date: dateStr,
        auditor: DOMElements.auditor.value.trim(),
        validationCategory: DOMElements.validationCategory.value,
        styleNumber: DOMElements.styleNumberInput.value,
        model: DOMElements.model.value,
        line: DOMElements.line.value
    };
    
    const pairsData = [];
    DOMElements.dataEntryBody.querySelectorAll('tr').forEach(tr => {
        pairsData.push({
            pairNumber: parseInt(tr.dataset.pairNumber),
            status: tr.querySelector('.status-select').value,
            defects: JSON.parse(tr.dataset.defects || '[]'),
            photos: JSON.parse(tr.dataset.photos || '[]')
        });
    });
    
    const fileId = `lwt_${now.getTime()}`;
    const fileName = `LWT-${headerData.validationCategory || 'DATA'}-${dateStr}-${timeStr}`;
    const fileData = { id: fileId, name: fileName, header: headerData, pairs: pairsData };

    // Simpan ke penyimpanan lokal
    const existingData = getSavedData();
    existingData.push(fileData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));
    
    // >>> TAMPILKAN OVERLAY SEBELUM MEMULAI PROSES ASINKRON
    showLoadingOverlay();
    
    try {
        console.log(`Data lokal ${fileName} berhasil disimpan. Mencoba sinkronisasi ke Google Drive...`);
        // Menggunakan 'await' untuk menunggu proses sinkronisasi dan konversi file selesai
        await syncToGoogleDrive(fileData);
        
    } catch (error) {
        // Notifikasi kegagalan sinkronisasi (jika terjadi)
        console.error('Sinkronisasi gagal:', error);
        alert('Data berhasil disimpan secara lokal, tetapi GAGAL sinkronisasi ke Google Drive. Periksa konsol untuk detail atau coba download manual.');
    } finally {
        // >>> SEMBUNYIKAN OVERLAY SETELAH SEMUA PROSES SELESAI
        hideLoadingOverlay();
    }
    
    renderSavedFiles();
    resetFullForm();
}

// TAMBAHKAN FUNGSI BARU INI KE DALAM script.js

/**
 * Membuat file ZIP, mengubahnya menjadi base64, dan mengirimkannya ke Google Apps Script.
 * @param {Object} fileData - Objek data lengkap yang akan disinkronkan.
 */
async function syncToGoogleDrive(fileData) {
    console.log("Mempersiapkan file ZIP untuk diunggah...");
    
    try {
        const zip = new JSZip();
        const imgFolder = zip.folder("images");

        // 1. Buat konten Excel (sama seperti di fungsi download)
        const excelHeaders = ['Date', 'Auditor', 'Validation Category', 'Style Number', 'Model', 'Line', 'Pair Number', 'OK/NG', 'Photos Attached', 'Defect type 1', 'Defect type 2', 'Defect type 3', 'Defect type 4', 'Defect type 5', 'Defect type 6', 'Defect type 7', 'Defect type 8', 'Defect type 9', 'Defect type 10'];
        const dataForSheet = [excelHeaders];
        
        fileData.pairs.forEach(pair => {
            const photoNames = [];
            if (pair.photos && pair.photos.length > 0) {
                pair.photos.forEach((photo, index) => {
                    const photoName = `Pair-${pair.pairNumber}-Foto-${index + 1}.jpg`;
                    photoNames.push(photoName);
                    const base64Data = photo.data.split(',')[1];
                    imgFolder.file(photoName, base64Data, { base64: true });
                });
            }
            const row = [fileData.header.date, fileData.header.auditor, fileData.header.validationCategory, fileData.header.styleNumber, fileData.header.model, fileData.header.line, pair.pairNumber, pair.status, photoNames.join(', ')];
            for (let i = 0; i < 10; i++) {
                row.push(pair.defects[i] || '');
            }
            dataForSheet.push(row);
        });

        const ws1 = XLSX.utils.aoa_to_sheet(dataForSheet);
        const summaryData = generateSummaryData(fileData); // Pastikan fungsi ini ada
        const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, 'LWT Report');
        XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
        
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        zip.file(`${fileData.name}.xlsx`, excelBuffer);

       // 2. Generate ZIP sebagai blob, lalu konversi ke base64 (Ini perlu dijadikan await)
        const zipBlob = await zip.generateAsync({ type: "blob" });

        // Menggunakan Promise untuk menunggu FileReader selesai
        const zipBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(zipBlob);
            reader.onloadend = () => {
                const base64data = reader.result;
                resolve(base64data.split(',')[1]); 
            };
            reader.onerror = reject;
        });

        // 3. Kirim data ke Google Apps Script
        const payload = {
            fileName: fileData.name,
            zipFile: zipBase64
        };

        console.log("Mengirim data ke Google Apps Script...");
        const res = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        const response = await res.json();

        if (response.success) {
            console.log('Upload berhasil!', response.message);
            // Notifikasi gabungan yang baru
            alert(`Data berhasil disimpan dan Sinkronisasi ke Google Drive berhasil!`); 
        } else {
            // LEMPARKAN ERROR agar ditangkap oleh 'catch' di saveData()
            throw new Error(response.message || 'Respons Apps Script tidak sukses.');
        }

    } catch (error) {
        // Jika ada error (ZIP atau Fetch gagal), lempar ke pemanggil (saveData)
        console.error("Gagal membuat atau mengirim file ZIP:", error);
        throw new Error(`Gagal memproses file. Detail: ${error.message}`); 
    }
}
    
    function resetFullForm() {
        DOMElements.auditor.value = '';
        DOMElements.validationCategory.value = '';
        DOMElements.styleNumberInput.value = '';
        DOMElements.model.value = '';
        DOMElements.line.value = '';
        DOMElements.dataEntryBody.querySelectorAll('tr').forEach(resetRow);
    }
    
    function handleSavedFilesActions(e) {
        const target = e.target;
        const fileId = target.dataset.id;
        if (!fileId) return;

        if (target.classList.contains('download-btn')) {
            handleDownload(fileId);
        } else if (target.classList.contains('delete-btn')) {
            showModal({
                title: 'Konfirmasi Hapus File',
                body: `<p>Apakah Anda yakin ingin menghapus file ini secara permanen?</p>`,
                confirmText: 'Ya, Hapus',
                onConfirm: () => {
                    deleteDataFromStorage(fileId);
                    renderSavedFiles();
                    hideModal();
                }
            });
        }
    }

    async function handleDownload(fileId) {
        const fileData = getSavedData().find(item => item.id === fileId);
        if (!fileData) return alert('Data file tidak ditemukan!');
        
        const zip = new JSZip();
        const imgFolder = zip.folder("images");
        
        // ===== SHEET 1: LWT Report =====
        const excelHeaders = ['Date', 'Auditor', 'Validation Category', 'Style Number', 'Model', 'Line', 'Pair Number', 'OK/NG', 'Photos Attached', 'Defect type 1', 'Defect type 2', 'Defect type 3', 'Defect type 4', 'Defect type 5', 'Defect type 6', 'Defect type 7', 'Defect type 8', 'Defect type 9', 'Defect type 10'];
        const dataForSheet = [excelHeaders];
        
        fileData.pairs.forEach(pair => {
            const photoNames = [];
            
            if (pair.photos && pair.photos.length > 0) {
                pair.photos.forEach((photo, index) => {
                    const photoName = `Pair-${pair.pairNumber}-Foto-${index + 1}.jpg`;
                    photoNames.push(photoName);
                    const base64Data = photo.data.split(',')[1]; 
                    imgFolder.file(photoName, base64Data, { base64: true });
                });
            }
            
            const row = [
                fileData.header.date, 
                fileData.header.auditor,
                fileData.header.validationCategory, 
                fileData.header.styleNumber, 
                fileData.header.model, 
                fileData.header.line, 
                pair.pairNumber, 
                pair.status, 
                photoNames.join(', ')
            ];
            
            for (let i = 0; i < 10; i++) {
                row.push(pair.defects[i] || '');
            }
            dataForSheet.push(row);
        });

        const ws1 = XLSX.utils.aoa_to_sheet(dataForSheet);
        
        // ===== SHEET 2: Summary =====
        const summaryData = generateSummaryData(fileData);
        const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
        
        // Buat Workbook dengan 2 sheet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, 'LWT Report');
        XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
        
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        zip.file(`${fileData.name}.xlsx`, excelBuffer);

        zip.generateAsync({ type: "blob" }).then(content => {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `${fileData.name}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    /**
     * Generate Summary Sheet Data
     */
    function generateSummaryData(fileData) {
        const categories = {
            'Contamination': [
                'Component alignment (visible or expose component)',
                'Component alignment right versus left',
                'Cutting/trimming (rubber flash, over triming, component edge; hairy & fraying)',
                'Lacing - Finished shoe lacing',
                'Midsole shape - less definition, deform and midsole texture',
                'Over cement on Finish shoes',
                'Over cement on Bottom unit'
            ],
            'Over-cement': [
                'Perforation, laser, or 2nd cutting consistency',
                'Staining/Contamination',
                'Stitching margins and SPI',
                'Thread End'
            ],
            'Thread End': [
                'Toe spring',
                'Toe stuffing (shape and placement inside the shoe)',
                'Tongue shape',
                'Wrapping paper',
                'Wrinkling midsole',
                'Wrinkling Upper',
                'X-Ray',
                'Sockliner Placement - missed position on finished shoes',
                'Painting Quality',
                'Binding or Folding Quality and consistency',
                'Stockfit part Quality (Placement and fitting)',
                'Airbag Contamination (PU, Painting and cement)',
                'Rat hole'
            ],
            'Hairy': [
                'Color migration and color mismatch',
                'Heel, Collar and Toe shape',
                'Hot Knife- Incomplete Hot Knife cutting'
            ],
            'Poor trimming outsole': [
                'Inner box condition (crushed, wrinkled, color variation, etc.)',
                'Lace loop/pull tab attachment - Broken lace loop/pull tab',
                'Midsole Color/Burning',
                'Midsole - under/over side wall buffing',
                'Emblishment; Quality and molded component definition',
                'Outsole colors (dam spillover) - Color Bleeding',
                'Over buffing'
            ],
            'Rocking': [
                'Rocking (>2mm)',
                'Off center'
            ],
            'Stitching / Loose thread': [
                'UPC label damaged',
                'Yellowing on sole unit',
                'Yellowing on upper'
            ],
            'Scratch/tear/rip high buffing': [
                'Rubber outsole quality (under cure, double skin, concave)',
                'Bond Gap and Delamination',
                'Broken Lace'
            ],
            'Alignment L+R Symmetry': [
                'Twisted and Inverted stance (banana shoe)',
                'Material tearing/damage',
                'Metal contamination'
            ],
            'Interior (sockliner)': [
                'Moldy',
                'No-sew Quality'
            ],
            'Bond gap': [
                'Plate/shank damage'
            ],
            'Wrinkle/crease/mis-shape': [
                'Size mis-match/ Wrong size/Wrong C/O label/Missing UPC label'
            ],
            'Other': [
                'Stitching (missing or gaps) - Broken / loose stitched'
            ]
        };

        // Count defects per category
        const categoryCounts = {};
        Object.keys(categories).forEach(cat => categoryCounts[cat] = 0);

        fileData.pairs.forEach(pair => {
            if (pair.defects && pair.defects.length > 0) {
                pair.defects.forEach(defect => {
                    for (const [category, defectList] of Object.entries(categories)) {
                        if (defectList.includes(defect)) {
                            categoryCounts[category]++;
                            break;
                        }
                    }
                });
            }
        });

        const totalDefects = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

        // Build summary array
        const headers = ['Date', 'Style Number', 'Model', 'Contamination', 'Over-cement', 'Thread End', 'Hairy', 'Poor trimming outsole', 'Rocking', 'Stitching / Loose thread', 'Scratch/tear/rip high buffing', 'Alignment L+R Symmetry', 'Interior (sockliner)', 'Bond gap', 'Wrinkle/crease/mis-shape', 'Other', 'Total Defect'];
        
        const dataRow = [
            fileData.header.date,
            fileData.header.styleNumber,
            fileData.header.model,
            categoryCounts['Contamination'],
            categoryCounts['Over-cement'],
            categoryCounts['Thread End'],
            categoryCounts['Hairy'],
            categoryCounts['Poor trimming outsole'],
            categoryCounts['Rocking'],
            categoryCounts['Stitching / Loose thread'],
            categoryCounts['Scratch/tear/rip high buffing'],
            categoryCounts['Alignment L+R Symmetry'],
            categoryCounts['Interior (sockliner)'],
            categoryCounts['Bond gap'],
            categoryCounts['Wrinkle/crease/mis-shape'],
            categoryCounts['Other'],
            totalDefects
        ];

        return [headers, dataRow];
    }

    function renderSavedFiles() {
        const data = getSavedData();
        const listElement = DOMElements.savedFilesList;
        listElement.innerHTML = '';
        
        if (data.length === 0) {
            listElement.innerHTML = '<li>Belum ada data yang tersimpan.</li>';
            return;
        }
        
        data.forEach(file => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="file-name">${file.name}</span>
                <div class="file-actions">
                    <button class="btn btn-primary download-btn" data-id="${file.id}">Download</button>
                    <button class="btn btn-danger delete-btn" data-id="${file.id}">Hapus</button>
                </div>
            `;
            listElement.appendChild(li);
        });
    }

    function deleteDataFromStorage(fileId) {
        let existingData = getSavedData();
        const updatedData = existingData.filter(item => item.id !== fileId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
    }
    
    function getSavedData() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }

    // =========================================================================
    // 7. UTILITY MODAL (Konfirmasi)
    // =========================================================================
    
    function showModal({ title, body, confirmText = 'OK', cancelText = 'Batal', onConfirm, onCancel }) {
        DOMElements.modalTitle.textContent = title;
        DOMElements.modalBody.innerHTML = body;
        DOMElements.modalConfirmBtn.textContent = confirmText;
        DOMElements.modalCancelBtn.textContent = cancelText;
        
        currentModalAction.onConfirm = onConfirm;
        currentModalAction.onCancel = onCancel || hideModal;
        
        DOMElements.modal.style.display = 'flex';
    }

    function hideModal() {
        DOMElements.modal.style.display = 'none';
        currentModalAction.onConfirm = null;
        currentModalAction.onCancel = null;
    }
    
    // =========================================================================
    // 7.b UTILITY OVERLAY FREEZE (BARU)
    // =========================================================================
    
    /**
     * Menampilkan loading overlay dan memblokir input user.
     */
    function showLoadingOverlay() {
        // Mencegah error jika elemen tidak ditemukan
        if (DOMElements.loadingOverlay) {
            DOMElements.loadingOverlay.style.display = 'flex';
        }
    }

    /**
     * Menyembunyikan loading overlay dan mengaktifkan kembali input user.
     */
    function hideLoadingOverlay() {
        if (DOMElements.loadingOverlay) {
            DOMElements.loadingOverlay.style.display = 'none';
        }
    }
    // =========================================================================
    // 8. JALANKAN APLIKASI
    // =========================================================================
    initializeApp();
});
