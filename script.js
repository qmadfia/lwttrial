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
    
 
    // Konstanta untuk batasan upload
    const MAX_PHOTOS_PER_PAIR = 10;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 5MB
    const MAX_WIDTH = 1024;
    const MAX_HEIGHT = 1024;

    // IndexedDB setup
    const DB_NAME = 'LWT_DB';
    const DB_VERSION = 1;
    const STORE_NAME = 'inspections';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveToDB(data) {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(data);
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async function getFromDB() {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteFromDB(id) {
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(id);
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Mengompresi gambar menggunakan Canvas API.
     * @param {string} base64String - Base64 string gambar asli.
     * @param {number} maxWidth - Lebar maksimal.
     * @param {number} maxHeight - Tinggi maksimal.
     * @param {number} quality - Kualitas kompresi (0-1).
     * @returns {Promise<string>} Base64 string gambar terkompresi.
     */
    function compressImage(base64String, maxWidth = MAX_WIDTH, maxHeight = MAX_HEIGHT, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Hitung ukuran baru sambil maintain aspect ratio
                let { width, height } = img;
                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                // Draw gambar ke canvas
                ctx.drawImage(img, 0, 0, width, height);

                // Konversi ke base64 dengan kualitas rendah
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            img.onerror = reject;
            img.src = base64String;
        });
    }

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
    
async function initializeApp() {
    populateLineDropdown();
    generateDataEntryRows();
    setupEventListeners();
    const existingData = await getFromDB();
    await renderSavedFilesOptimized(existingData, null);
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
                        <input type="file" accept="image/*,text/plain" class="hidden-file-input" multiple style="display:none;">
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

    // Periksa batas foto di awal
    let currentPhotos = JSON.parse(tr.dataset.photos || '[]');
    if (currentPhotos.length >= MAX_PHOTOS_PER_PAIR) {
        alert(`Jumlah ${MAX_PHOTOS_PER_PAIR} limit foto sudah terpenuhi. Hapus salah satu foto jika Anda ingin mengunggah foto lain.`);
        e.target.value = ''; // Reset input file
        return;
    }

    // Hitung berapa slot yang tersedia
    const availableSlots = MAX_PHOTOS_PER_PAIR - currentPhotos.length;
    const filesToProcess = Array.from(files).slice(0, availableSlots);

    if (filesToProcess.length < files.length) {
        alert(`Hanya ${filesToProcess.length} foto yang dapat diunggah karena batas maksimum adalah ${MAX_PHOTOS_PER_PAIR} foto per pair. Hapus foto yang ada untuk mengunggah lebih banyak.`);
    }

    // Proses file yang diizinkan
    const processPromises = filesToProcess.map(async (file) => {
        // Validasi tipe file
        if (!file.type.startsWith('image/')) {
            alert(`File ${file.name} bukan gambar. Hanya file gambar yang diperbolehkan.`);
            return null;
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                let base64String = event.target.result;

                // Jika ukuran file asli > MAX_FILE_SIZE, coba kompresi
                if (file.size > MAX_FILE_SIZE) {
                    try {
                        console.log(`Mengompresi ${file.name}...`);
                        base64String = await compressImage(base64String);
                        // Periksa ukuran setelah kompresi (estimasi)
                        const compressedSize = (base64String.length * 3) / 4; // Approx size
                        if (compressedSize > MAX_FILE_SIZE) {
                            alert(`File ${file.name} masih terlalu besar setelah kompresi. Maksimal 5MB.`);
                            resolve(null);
                            return;
                        }
                        alert(`File ${file.name} berhasil dikompresi.`);
                    } catch (error) {
                        alert(`Gagal mengompresi ${file.name}. ${error.message}`);
                        resolve(null);
                        return;
                    }
                }

                resolve({ name: file.name, data: base64String });
            };
            reader.onerror = () => {
                alert(`Gagal membaca file ${file.name}. Pastikan file adalah gambar valid dan tidak rusak.`);
                resolve(null);
            };
            reader.readAsDataURL(file);
        });
    });

    // Tunggu semua file selesai diproses
    Promise.all(processPromises).then((results) => {
        let photos = JSON.parse(tr.dataset.photos || '[]');
        results.forEach(result => {
            if (result) {
                photos.push(result);
            }
        });
        tr.dataset.photos = JSON.stringify(photos);
        updatePhotoGallery(tr);
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
    tr.dataset.otherDefects = '[]'; // TAMBAHKAN BARIS INI
    updateDefectTags(tr);
}

    function resetPhotosForRow(tr) {
        tr.dataset.photos = '[]';
        updatePhotoGallery(tr);
    }

function showDefectSelectionModal(tr) {
    const currentDefects = JSON.parse(tr.dataset.defects || '[]');
    const currentOtherDefects = JSON.parse(tr.dataset.otherDefects || '[]'); // Data input manual
    
    let optionsHTML = defectTypes.map(defect => {
        const isOther = defect === 'Other Defects';
        const isChecked = isOther ? currentOtherDefects.length > 0 : currentDefects.includes(defect);
        
        return `
            <label>
                <input type="checkbox" value="${defect}" ${isChecked ? 'checked' : ''}>
                ${defect}
            </label>
        `;
    }).join('');
    
    // Input field untuk Other Defects
    const otherDefectsInputHTML = `
        <div id="other-defects-input-container" style="display: ${currentOtherDefects.length > 0 ? 'block' : 'none'}; margin-top: 10px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Detail Other Defects:</label>
            <input type="text" id="other-defects-detail" class="search-bar" placeholder="Ketik detail defect (contoh: Hairy, Outsole Kotor, dll)" value="${currentOtherDefects.join(', ')}" style="margin-bottom: 0;">
            <small style="display: block; margin-top: 5px; color: #666;">Pisahkan dengan koma jika lebih dari satu defect</small>
        </div>
    `;
    
    const modalBodyHTML = `
        <div id="defect-selection-modal">
            <input type="text" class="search-bar" placeholder="Cari tipe defect...">
            <div class="options-container">${optionsHTML}</div>
            ${otherDefectsInputHTML}
        </div>`;
    
    showModal({
        title: `Pilih Defect untuk Pair #${tr.dataset.pairNumber}`,
        body: modalBodyHTML,
        confirmText: 'Simpan Pilihan',
        onConfirm: () => {
            const selected = [];
            const otherDefectDetails = [];
            
            document.querySelectorAll('#defect-selection-modal input[type="checkbox"]:checked').forEach(cb => {
                if (cb.value === 'Other Defects') {
                    // Ambil detail dari input manual
                    const detailInput = document.getElementById('other-defects-detail').value.trim();
                    if (detailInput) {
                        // Split berdasarkan koma dan trim setiap item
                        const details = detailInput.split(',').map(d => d.trim()).filter(d => d);
                        otherDefectDetails.push(...details);
                        selected.push(cb.value);
                    }
                } else {
                    selected.push(cb.value);
                }
            });
            
            tr.dataset.defects = JSON.stringify(selected);
            tr.dataset.otherDefects = JSON.stringify(otherDefectDetails);
            updateDefectTags(tr);
            hideModal();
        },
    });
    
    // Event listener untuk search bar
    document.querySelector('#defect-selection-modal .search-bar').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('#defect-selection-modal label').forEach(label => {
            const matches = label.textContent.trim().toLowerCase().includes(searchTerm);
            label.style.display = matches ? 'flex' : 'none';
        });
    });
    
    // Event listener untuk checkbox "Other Defects"
    document.querySelectorAll('#defect-selection-modal input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.value === 'Other Defects') {
                const inputContainer = document.getElementById('other-defects-input-container');
                inputContainer.style.display = e.target.checked ? 'block' : 'none';
                
                // Clear input jika unchecked
                if (!e.target.checked) {
                    document.getElementById('other-defects-detail').value = '';
                }
            }
        });
    });
}

function updateDefectTags(tr) {
    const wrapper = tr.querySelector('.defect-tags-wrapper');
    const defects = JSON.parse(tr.dataset.defects || '[]');
    const otherDefects = JSON.parse(tr.dataset.otherDefects || '[]');
    wrapper.innerHTML = '';
    
    if (defects.length > 0 || otherDefects.length > 0) {
        // Tampilkan defect biasa
        defects.forEach(defect => {
            if (defect !== 'Other Defects') {
                const tag = document.createElement('span');
                tag.className = 'defect-tag';
                tag.textContent = defect;
                wrapper.appendChild(tag);
            }
        });
        
        // Tampilkan detail Other Defects
        otherDefects.forEach(detail => {
            const tag = document.createElement('span');
            tag.className = 'defect-tag';
            tag.textContent = detail;
            tag.style.backgroundColor = '#ff9800'; // Warna berbeda untuk Other Defects
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
    showLoadingOverlay();

    try {
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

        // Optimasi: Kumpulkan data dalam satu pass dengan error handling
const pairsData = Array.from(DOMElements.dataEntryBody.querySelectorAll('tr')).map(tr => {
    try {
        const dataset = tr.dataset;
        return {
            pairNumber: parseInt(dataset.pairNumber),
            status: tr.querySelector('.status-select').value,
            defects: dataset.defects ? JSON.parse(dataset.defects) : [],
            otherDefects: dataset.otherDefects ? JSON.parse(dataset.otherDefects) : [], // TAMBAHKAN BARIS INI
            photos: dataset.photos ? JSON.parse(dataset.photos) : []
        };
    } catch (error) {
        console.error(`Error parsing data for pair ${tr.dataset.pairNumber}:`, error);
        alert(`Error pada pair ${tr.dataset.pairNumber}: ${error.message}. Data tidak dapat disimpan.`);
        throw error;
    }
});

        const fileId = `lwt_${now.getTime()}`;
        const fileName = `LWT-${headerData.validationCategory || 'DATA'}-${dateStr}-${timeStr}`;
        const fileData = { id: fileId, name: fileName, header: headerData, pairs: pairsData };

        // Optimasi: Gabungkan transaksi IndexedDB
        const db = await openDB();
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Periksa batas file dan hapus yang lama dalam satu transaksi
        const existingDataRequest = store.getAll();
        const existingData = await new Promise((resolve, reject) => {
            existingDataRequest.onsuccess = () => resolve(existingDataRequest.result);
            existingDataRequest.onerror = () => reject(existingDataRequest.error);
        });

        if (existingData.length >= 10) {
            const oldest = existingData.reduce((min, item) => item.id < min.id ? item : min);
            store.delete(oldest.id);
            existingData.splice(existingData.indexOf(oldest), 1);
        }

        // Simpan data baru
        store.put(fileData);

        // Tunggu transaksi selesai
        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });

        // Notifikasi sukses
        alert('Data berhasil disimpan!');

        // Reset form
        resetFullForm();

        // Optimasi: Render ulang dengan DOM diffing sederhana
        await renderSavedFilesOptimized(existingData, fileData);
    } catch (error) {
        console.error('Gagal menyimpan data:', error);
        alert(`Gagal menyimpan data: ${error.message}`);
    } finally {
        hideLoadingOverlay();
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
    
async function handleSavedFilesActions(e) {
    const target = e.target;
    const fileId = target.dataset.id;
    if (!fileId) return;

    if (target.classList.contains('download-btn')) {
        const fileData = (await getFromDB()).find(item => item.id === fileId);
        if (!fileData) {
            // Hilangkan popup, cukup refresh daftar
            const existingData = await getFromDB();
            await renderSavedFilesOptimized(existingData, null);
            return;
        }
        try {
            await handleDownload(fileData);
        } catch (error) {
            console.error('Error saat download:', error);
            alert(`Gagal memulai download: ${error.message}`);
        }
    } else if (target.classList.contains('delete-btn')) {
        showModal({
            title: 'Konfirmasi Hapus File',
            body: `<p>Apakah Anda yakin ingin menghapus file ini secara permanen?</p>`,
            confirmText: 'Ya, Hapus',
            onConfirm: async () => {
                await deleteFromDB(fileId);
                const existingData = await getFromDB();
                await renderSavedFilesOptimized(existingData, null);
                hideModal();
            }
        });
    }
}

async function handleDownload(fileData) {
    showLoadingOverlay();

    try {
        const zip = new JSZip();
        const imgFolder = zip.folder("images");

        // ===== SHEET 1: LWT Report =====
        const excelHeaders = ['Date', 'Auditor', 'Validation Category', 'Style Number', 'Model', 'Line', 'Pair Number', 'OK/NG', 'Photos Attached', 'Defect type 1', 'Defect type 2', 'Defect type 3', 'Defect type 4', 'Defect type 5', 'Defect type 6', 'Defect type 7', 'Defect type 8', 'Defect type 9', 'Defect type 10'];
        const dataForSheet = [excelHeaders];

        const photoPromises = [];
        fileData.pairs.forEach(pair => {
            const photoNames = [];
            if (pair.photos && pair.photos.length > 0) {
                pair.photos.forEach((photo, index) => {
                    const photoName = `Pair-${pair.pairNumber}-Foto-${index + 1}.jpg`;
                    photoNames.push(photoName);
                    photoPromises.push({
                        name: photoName,
                        data: photo.data.startsWith('data:image') ? photo.data.split(',')[1] : photo.data
                    });
                });
            }

            // MODIFIKASI BAGIAN INI - Gabungkan defect biasa dengan Other Defects
            const allDefects = [];
            
            // Tambahkan defect biasa (yang bukan "Other Defects")
            if (pair.defects && pair.defects.length > 0) {
                pair.defects.forEach(defect => {
                    if (defect !== 'Other Defects') {
                        allDefects.push(defect);
                    }
                });
            }
            
            // Tambahkan semua detail Other Defects sebagai "Other Defects"
            if (pair.otherDefects && pair.otherDefects.length > 0) {
                pair.otherDefects.forEach(() => {
                    allDefects.push('Other Defects');
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
                photoNames.join(', '),
                ...Array(10).fill('').map((_, i) => allDefects[i] || '')
            ];

            dataForSheet.push(row);
        });

        for (const { name, data } of photoPromises) {
            imgFolder.file(name, data, { base64: true });
        }

        const ws1 = XLSX.utils.aoa_to_sheet(dataForSheet);

        // ===== SHEET 2: Summary =====
        const summaryData = generateSummaryData(fileData);
        const ws2 = XLSX.utils.aoa_to_sheet(summaryData);

        // ===== SHEET 3: Other Defects =====
        const otherDefectsData = generateOtherDefectsSheet(fileData);
        const ws3 = XLSX.utils.aoa_to_sheet(otherDefectsData);

        // Buat Workbook dengan 3 sheet
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws1, 'LWT Report');
        XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
        XLSX.utils.book_append_sheet(wb, ws3, 'Other Defects');

        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        zip.file(`${fileData.name}.xlsx`, excelBuffer);

        const content = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `${fileData.name}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Gagal membuat file download:', error);
        alert(`Gagal membuat file download: ${error.message}`);
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * Generate Summary Sheet Data
 */
function generateSummaryData(fileData) {
    const defectList = [
        'Airbag Defect',
        'Left & Right not matching',
        'Bondgap/Rat Hole',
        'Delamination',
        'Overcement',
        'Contamination',
        'Interior Defect',
        'Accessories Defect',
        'Color/Paint Migration, Bleeding',
        'Color Mismatch',
        'Paint Peeled off / Paint Surface Quality',
        'Material Damaged',
        'Punching holes bad quality',
        'Overbuffing',
        'Jump / Broken / Loose Stitching',
        'Thread End',
        'Stitching Margin',
        'Off Center',
        'Rocking',
        'Toe Spring',
        'Wrinkle or Deformed Bottom',
        'Wrinkle or Deformed Upper',
        'X-Ray',
        'Other Defects',
        'Yellowing'
    ];

    const defectCounts = {};
    defectList.forEach(defect => defectCounts[defect] = 0);

    fileData.pairs.forEach(pair => {
        if (pair.defects && pair.defects.length > 0) {
            pair.defects.forEach(defect => {
                if (defectList.includes(defect)) {
                    // MODIFIKASI: Untuk Other Defects, hitung jumlah detail yang diinput
                    if (defect === 'Other Defects' && pair.otherDefects && pair.otherDefects.length > 0) {
                        defectCounts[defect] += pair.otherDefects.length; // UBAH DARI ++ MENJADI += length
                    } else if (defect !== 'Other Defects') {
                        defectCounts[defect]++;
                    }
                }
            });
        }
    });

    const totalDefects = Object.values(defectCounts).reduce((a, b) => a + b, 0);

    const headers = [
        'Date',
        'Style Number',
        'Model',
        'Airbag Defect',
        'Left & Right not matching',
        'Bondgap/Rat Hole',
        'Delamination',
        'Overcement',
        'Contamination',
        'Interior Defect',
        'Accessories Defect',
        'Color/Paint Migration, Bleeding',
        'Color Mismatch',
        'Paint Peeled off / Paint Surface Quality',
        'Material Damaged',
        'Punching holes bad quality',
        'Overbuffing',
        'Jump / Broken / Loose Stitching',
        'Thread End',
        'Stitching Margin',
        'Off Center',
        'Rocking',
        'Toe Spring',
        'Wrinkle or Deformed Bottom',
        'Wrinkle or Deformed Upper',
        'X-Ray',
        'Other Defects',
        'Yellowing',
        'Total Defect'
    ];

    const dataRow = [
        fileData.header.date,
        fileData.header.styleNumber,
        fileData.header.model,
        defectCounts['Airbag Defect'],
        defectCounts['Left & Right not matching'],
        defectCounts['Bondgap/Rat Hole'],
        defectCounts['Delamination'],
        defectCounts['Overcement'],
        defectCounts['Contamination'],
        defectCounts['Interior Defect'],
        defectCounts['Accessories Defect'],
        defectCounts['Color/Paint Migration, Bleeding'],
        defectCounts['Color Mismatch'],
        defectCounts['Paint Peeled off / Paint Surface Quality'],
        defectCounts['Material Damaged'],
        defectCounts['Punching holes bad quality'],
        defectCounts['Overbuffing'],
        defectCounts['Jump / Broken / Loose Stitching'],
        defectCounts['Thread End'],
        defectCounts['Stitching Margin'],
        defectCounts['Off Center'],
        defectCounts['Rocking'],
        defectCounts['Toe Spring'],
        defectCounts['Wrinkle or Deformed Bottom'],
        defectCounts['Wrinkle or Deformed Upper'],
        defectCounts['X-Ray'],
        defectCounts['Other Defects'],
        defectCounts['Yellowing'],
        totalDefects
    ];

    return [headers, dataRow];
}

/**
 * Generate Other Defects Sheet Data
 */
function generateOtherDefectsSheet(fileData) {
    const headers = ['Pair Number', 'Defect detail for other'];
    const rows = [headers];

    fileData.pairs.forEach(pair => {
        // Cek apakah pair ini memiliki Other Defects
        if (pair.otherDefects && pair.otherDefects.length > 0) {
            pair.otherDefects.forEach(detail => {
                rows.push([pair.pairNumber, detail]);
            });
        }
    });

    // Jika tidak ada Other Defects, kembalikan sheet kosong dengan header saja
    if (rows.length === 1) {
        rows.push(['', 'No Other Defects recorded']);
    }

    return rows;
}

async function renderSavedFilesOptimized(existingData, newFileData) {
    const listElement = DOMElements.savedFilesList;

    // Tambahkan data baru jika ada
    let data = existingData;
    if (newFileData) {
        data = [...existingData, newFileData];
    }
    data = data.sort((a, b) => b.id.localeCompare(a.id)); // Urutkan berdasarkan ID (terbaru dulu)

    // Kosongkan listElement sepenuhnya sebelum render
    listElement.innerHTML = '';

    // Jika tidak ada data, tampilkan pesan placeholder
    if (data.length === 0) {
        listElement.innerHTML = '<li>Belum ada data yang tersimpan.</li>';
        return;
    }

    // Render elemen untuk setiap file
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

    function getSavedData() {
        return getFromDB();
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
        if (DOMElements.uploadProgress) {
            DOMElements.uploadProgress.style.display = 'block';
            DOMElements.uploadProgress.value = 0;
        }
    }

    /**
     * Menyembunyikan loading overlay dan mengaktifkan kembali input user.
     */
    function hideLoadingOverlay() {
        if (DOMElements.loadingOverlay) {
            DOMElements.loadingOverlay.style.display = 'none';
        }
        if (DOMElements.uploadProgress) {
            DOMElements.uploadProgress.style.display = 'none';
        }
    }
    // =========================================================================
    // 8. JALANKAN APLIKASI
    // =========================================================================
    initializeApp();
});
