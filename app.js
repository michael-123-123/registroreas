/**
 * ===================================================================
 * APP.JS - Lógica para App de Registro GestiónREAS
 * Versión: 18.0 (Añadido Campo Contenedor)
 * Descripción: Se agrega un nuevo campo "Contenedor" para los
 * residuos Especiales y Peligrosos. Se actualizan formularios,
 * tablas y lógica de guardado/edición para incluir este dato.
 * ===================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURACIÓN DE SUPABASE ---
    const SUPABASE_URL = 'https://peiuznumhjdynbffabyq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlaXV6bnVtaGpkeW5iZmZhYnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3MTE4NTksImV4cCI6MjA3NDI4Nzg1OX0.T6KloEC3W-fpnaqNYxlNWV0aT4FyzxwPUD0UhcqvuJM';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // --- ELEMENTOS DEL DOM ---
    const appMain = document.getElementById('app-main');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');

    // --- ESTADO DE LA APLICACIÓN Y DATOS EN CACHÉ ---
    let unitsCache = [],
        equipmentCache = [],
        signaturePad = null;
    
    const containerOptions = ['Bolsa', 'Pro 1', 'Pro 3', 'Pro 6', 'Pro 10', 'Pro 15', 'Rebox 2', 'Rebox 3', 'Rebox 4'];

    const wasteTypeOptions = {
        hazardous: [
            'ACIDO CLORHIDRICO', 'ALCOHOL', 'ALCOHOL GEL', 'ALEACION PARA AMALGAMA DENTAL',
            'AMPOLLAS Y FRASCOS CON RESTOS DE MEDICAMENTOS', 'AMPOLLETAS FLUORESCENTES',
            'APOSITOS CON FORMALINA', 'ARENA CONTAMINADA CON HIDROCARBUROS',
            'ASERRIN CONTAMINADO CON HIDROCARBUROS', 'ATROPINA SULFATO', 'BATERIAS DE NIQUEL-CADMIO',
            'BATERIAS DE PLOMO', 'BATERIAS NI - MH', 'CAL SODADA',
            'CILINDROS VACIOS DE GAS ISOBUTANO PROPANO', 'CITOTOXICOS', 'DETERGENTES INDUSTRIALES',
            'ELEMENTOS CON PLOMO', 'ENVASES CON RESTOS DE SUSTANCIAS PELIGROSAS', 'ETER ETILICO',
            'FENOL', 'FORMALINA', 'INHALADORES', 'LIQUIDO REVELADOR', 'MEDICAMENTOS VENCIDOS',
            'MERCURIO CONTENIDO EN TERMOMETROS O ESFIGMOMANOMETROS', 'MERCURIO CROMO',
            'MEZCLA DE AMONIOS CUATERNARIOS', 'NITRITO DE SODIO', 'ORTOFTALDEHIDO',
            'OXIDO DE ETILENO', 'PEROXIDO DE HIDROGENO', 'PILAS', 'PLACAS DE PLOMO',
            'PLATA NITRATO', 'REACTIVOS DE LABORATORIO',
            'RESIDUOS DE ACEITES Y LUBRICANTES (EXCEPTO LAS EMULSIONES)', 'SOLUCION PAF',
            'SOLVENTE DE QUEMAR','SOBRANTES Y CONTAMINADOS CON MEDIO DE CONTRASTE (YODADO)', 'TERMOMETROS CON MERCURIO', 'TONER', 'TUBOS FLUORESCENTES',
            'VIOLETA GENCIANA CRITAL', 'YODO SUBLIMADO', 'SOLUCION GIEMSA DE DESECHO', 'OLEOFINA'
        ],
        special: ['CORTO-PUNZANTES', 'CULTIVOS Y MUESTRAS ALMACENADAS', 'PATOLOGICOS', 'RESTOS DE ANIMALES', 'SANGRE Y PRODUCTOS DERIVADOS']
    };

    /**
     * MANEJO DE AUTENTICACIÓN Y SESIÓN
     */
    const Auth = {
        async checkSession() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                window.location.href = 'login.html';
                return;
            }
            appMain.classList.remove('hidden');
            userEmailEl.textContent = session.user.email;
            initializeApp();
        },
        async signOut() {
            await supabase.auth.signOut();
            window.location.href = 'login.html';
        }
    };

    /**
     * INICIALIZACIÓN DE LA APLICACIÓN
     */
    async function initializeApp() {
        await loadCaches();
        setupNavigation();
        WasteModule.init();
        EquipmentModule.init();
        document.addEventListener('click', (e) => {
            document.querySelectorAll('.searchable-dropdown-container').forEach(container => {
                if (!container.contains(e.target)) {
                    container.querySelector('.searchable-dropdown-list').classList.add('hidden');
                }
            });
        });
    }

    async function loadCaches() {
        try {
            const [units, equipment] = await Promise.all([
                supabase.from('units').select('id, name').order('name'),
                supabase.from('equipment').select('id, name, serial_number, status').order('name')
            ]);
            unitsCache = units.data || [];
            equipmentCache = equipment.data || [];
        } catch (error) {
            console.error("Error loading cache:", error);
            alert("No se pudieron cargar los datos iniciales. Revise la conexión.");
        }
    }

    function setupNavigation() {
        const tabs = document.querySelectorAll('.main-tab-btn');
        const panes = document.querySelectorAll('.tab-pane');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                panes.forEach(p => p.classList.add('hidden'));
                document.getElementById(`tab-content-${tab.dataset.tab}`).classList.remove('hidden');
            });
        });
    }

    function getCurrentDateTimeLocal() {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    }

    // ===================================================================
    // MÓDULO DE PRÉSTAMO DE EQUIPOS (Sin cambios)
    // ===================================================================
    const EquipmentModule = {
        init() {
            document.getElementById('equipment-search-input').addEventListener('input', (e) => {
                this.loadAndRenderEquipment(e.target.value);
            });
            this.loadAndRenderEquipment();
            document.getElementById('equipment-list-container').addEventListener('click', this.handleCardClick.bind(this));
        },
        async loadAndRenderEquipment(searchTerm = '') {
            const container = document.getElementById('equipment-list-container');
            if (!container) return;
            container.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
            await loadCaches();
            let filteredEquipment = equipmentCache;
            if (searchTerm) {
                const lowerCaseSearch = searchTerm.toLowerCase();
                filteredEquipment = equipmentCache.filter(eq =>
                    eq.name.toLowerCase().includes(lowerCaseSearch) ||
                    (eq.serial_number && eq.serial_number.toLowerCase().includes(lowerCaseSearch))
                );
            }
            const { data: activeLoansData, error } = await supabase.from('equipment_loans').select('*').is('return_date', null);
            if (error) {
                container.innerHTML = '<p class="text-danger">Error al cargar el estado de los equipos.</p>';
                return;
            }
            const activeLoansMap = new Map((activeLoansData || []).map(loan => [loan.equipment_id, loan]));
            if (filteredEquipment.length === 0) {
                container.innerHTML = '<p class="text-secondary text-center p-4">No se encontraron equipos.</p>';
                return;
            }
            container.innerHTML = filteredEquipment.map(eq => {
                const activeLoan = activeLoansMap.get(eq.id);
                const isInUse = !!activeLoan;
                const status = isInUse ? 'En Préstamo' : eq.status;
                const statusClass = isInUse ? 'status-prestamo' : 'status-disponible';
                const isAbrillantadora = eq.name.toLowerCase().includes('abrillantadora');
                return `
                    <div class="equipment-card">
                        <div>
                            ${isAbrillantadora ? '<img src="abrillantadora.png" alt="Imagen de la abrillantadora" class="equipment-image">' : ''}
                            <div class="equipment-header">
                                <h3 class="font-bold text-lg">${eq.name}</h3>
                                <span class="equipment-status ${statusClass}">${status}</span>
                            </div>
                            <p class="text-sm text-secondary mb-2">N/S: ${eq.serial_number || 'N/A'}</p>
                            ${isInUse ? `<div class="loan-details">
                               <p><strong>Prestado a:</strong> ${activeLoan.withdrawing_employee}</p>
                               <p><strong>Fecha:</strong> ${new Date(activeLoan.date_of_delivery).toLocaleString('es-CL')}</p>
                            </div>` : ''}
                        </div>
                        <div class="equipment-actions">
                            <button class="btn btn-sm btn-primary btn-prestar" data-id="${eq.id}" ${isInUse || status !== 'Disponible' ? 'disabled' : ''}>Prestar</button>
                            <button class="btn btn-sm btn-success btn-devolver" data-id="${eq.id}" data-loan-id="${activeLoan?.id}" ${!isInUse ? 'disabled' : ''}>Devolver</button>
                            <button class="btn btn-sm btn-secondary btn-historial" data-id="${eq.id}">Historial</button>
                        </div>
                    </div>`;
            }).join('');
        },
        handleCardClick(e) {
            const button = e.target.closest('button');
            if (!button) return;
            const equipmentId = button.dataset.id;
            if (button.classList.contains('btn-prestar')) this.openLoanModal(equipmentId);
            else if (button.classList.contains('btn-devolver')) this.openReturnModal(equipmentId, button.dataset.loanId);
            else if (button.classList.contains('btn-historial')) this.openHistoryModal(equipmentId);
        },
        openLoanModal(equipmentId) {
            const equipment = equipmentCache.find(e => e.id === equipmentId);
            const formHTML = `
                <div class="form-group">
                    <label for="loan-datetime">Fecha y Hora de Entrega</label>
                    <input id="loan-datetime" type="datetime-local" name="date_of_delivery" value="${getCurrentDateTimeLocal()}" class="form-input" required>
                </div>
                <div class="form-group">
                    <label for="loan-employee">Nombre de quien retira</label>
                    <input id="loan-employee" type="text" name="withdrawing_employee" class="form-input" required>
                </div>
                <div class="form-group">
                    <label for="loan-obs">Observaciones (Opcional)</label>
                    <textarea id="loan-obs" name="delivery_observations" class="form-input" rows="2"></textarea>
                </div>
                <div class="form-group">
                    <label>Firma de quien retira</label>
                    <canvas class="signature-pad"></canvas>
                    <button type="button" class="clear-signature-btn">Limpiar Firma</button>
                </div>`;
            this.createModal(`Prestar: ${equipment.name}`, formHTML, 'Confirmar Préstamo', (e) => this.handleLoanSubmit(e, equipmentId));
        },
        openReturnModal(equipmentId, loanId) {
            const equipment = equipmentCache.find(e => e.id === equipmentId);
            const formHTML = `
                <div class="form-group">
                    <label for="return-datetime">Fecha y Hora de Devolución</label>
                    <input id="return-datetime" type="datetime-local" name="return_date" value="${getCurrentDateTimeLocal()}" class="form-input" required>
                </div>
                <div class="form-group">
                    <label for="return-employee">Nombre de quien devuelve</label>
                    <input id="return-employee" type="text" name="returning_employee" class="form-input" required>
                </div>
                <div class="form-group">
                    <label for="return-condition">Condición de Devolución</label>
                    <select id="return-condition" name="return_condition" class="form-input">
                        <option value="Disponible">Disponible</option>
                        <option value="En Mantenimiento">Requiere Mantenimiento</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="return-obs">Observaciones (Opcional)</label>
                    <textarea id="return-obs" name="return_observations" class="form-input" rows="2"></textarea>
                </div>
                <div class="form-group">
                    <label>Firma de quien devuelve</label>
                    <canvas class="signature-pad"></canvas>
                    <button type="button" class="clear-signature-btn">Limpiar Firma</button>
                </div>`;
            this.createModal(`Devolver: ${equipment.name}`, formHTML, 'Confirmar Devolución', (e) => this.handleReturnSubmit(e, equipmentId, loanId));
        },
        async openHistoryModal(equipmentId) {
            const equipment = equipmentCache.find(e => e.id === equipmentId);
            this.createModal(`Historial: ${equipment.name}`, '<div class="loader-container"><div class="loader"></div></div>', null, null, true);
            const { data, error } = await supabase.from('equipment_loans')
                .select('*')
                .eq('equipment_id', equipmentId)
                .order('date_of_delivery', { ascending: false });
            const modalBody = document.querySelector('.modal-body');
            if (error) {
                modalBody.innerHTML = '<p class="text-danger">Error al cargar el historial.</p>';
                return;
            }
            if (data.length === 0) {
                modalBody.innerHTML = '<p class="text-secondary">No hay historial de préstamos para este equipo.</p>';
                return;
            }
            modalBody.innerHTML = `
                <ul class="history-list">
                    ${data.map(loan => `
                        <li class="history-item">
                            <div class="history-header">
                                <strong>Préstamo:</strong> ${new Date(loan.date_of_delivery).toLocaleString('es-CL')}
                            </div>
                            <div class="history-body">
                                <p><strong>Retirado por:</strong> ${loan.withdrawing_employee}</p>
                                ${loan.delivery_signature ? `<p><strong>Firma Entrega:</strong> <img src="${loan.delivery_signature}" alt="Firma de entrega" class="signature-img"></p>` : ''}
                                ${loan.return_date ? `
                                    <div class="history-return">
                                        <p><strong>Devuelto:</strong> ${new Date(loan.return_date).toLocaleString('es-CL')}</p>
                                        <p><strong>Devuelto por:</strong> ${loan.returning_employee}</p>
                                        ${loan.return_signature ? `<p><strong>Firma Devolución:</strong> <img src="${loan.return_signature}" alt="Firma de devolución" class="signature-img"></p>` : ''}
                                    </div>
                                ` : '<p class="text-warning"><strong>Equipo actualmente en préstamo.</strong></p>'}
                            </div>
                        </li>
                    `).join('')}
                </ul>`;
        },
        async handleLoanSubmit(e, equipmentId) {
            e.preventDefault();
            if (signaturePad && signaturePad.isEmpty()) {
                return alert('La firma de quien retira es obligatoria.');
            }
            const form = e.target;
            const button = document.querySelector('.modal-footer .btn-primary');
            button.disabled = true;
            const formData = new FormData(form);
            const record = {
                equipment_id: equipmentId,
                date_of_delivery: formData.get('date_of_delivery'),
                withdrawing_employee: formData.get('withdrawing_employee'),
                delivery_observations: formData.get('delivery_observations'),
                delivery_signature: signaturePad.toDataURL('image/png')
            };
            const { error: loanError } = await supabase.from('equipment_loans').insert([record]);
            if (loanError) {
                alert('Error al registrar el préstamo: ' + loanError.message);
                button.disabled = false;
                return;
            }
            await supabase.from('equipment').update({ status: 'En Préstamo' }).eq('id', equipmentId);
            this.closeModal();
            this.loadAndRenderEquipment();
        },
        async handleReturnSubmit(e, equipmentId, loanId) {
            e.preventDefault();
            if (signaturePad && signaturePad.isEmpty()) {
                return alert('La firma de quien devuelve es obligatoria.');
            }
            const form = e.target;
            const button = document.querySelector('.modal-footer .btn-primary');
            button.disabled = true;
            const formData = new FormData(form);
            const newStatus = formData.get('return_condition');
            const updateData = {
                return_date: formData.get('return_date'),
                returning_employee: formData.get('returning_employee'),
                return_observations: formData.get('return_observations'),
                return_signature: signaturePad.toDataURL('image/png')
            };
            const { error: loanError } = await supabase.from('equipment_loans').update(updateData).eq('id', loanId);
            if (loanError) {
                alert('Error al registrar la devolución: ' + loanError.message);
                button.disabled = false;
                return;
            }
            await supabase.from('equipment').update({ status: newStatus }).eq('id', equipmentId);
            this.closeModal();
            this.loadAndRenderEquipment();
        },
        createModal(title, formHTML, submitText, submitHandler, isHistory = false, btnClass = 'btn-primary') {
            const modalContainer = document.getElementById('modal-container');
            modalContainer.innerHTML = `
                <div class="modal-content ${isHistory ? 'modal-lg' : ''}">
                    <div class="modal-header"><h2>${title}</h2><button id="close-modal-btn">&times;</button></div>
                    <div id="modal-body-content" class="modal-body">
                        ${isHistory ? formHTML : `<form id="modal-form" class="waste-form-grid">${formHTML}</form>`}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="cancel-modal-btn">Cancelar</button>
                        ${submitText ? `<button type="submit" form="modal-form" class="btn ${btnClass}">${submitText}</button>` : ''}
                    </div>
                </div>`;
            modalContainer.classList.remove('hidden');
            const canvas = modalContainer.querySelector('.signature-pad');
            if (canvas) {
                signaturePad = new SignaturePad(canvas, { backgroundColor: 'rgb(249, 250, 251)' });
                function resizeCanvas() {
                    const ratio = Math.max(window.devicePixelRatio || 1, 1);
                    canvas.width = canvas.offsetWidth * ratio;
                    canvas.height = canvas.offsetHeight * ratio;
                    canvas.getContext("2d").scale(ratio, ratio);
                    signaturePad.clear();
                }
                window.addEventListener("resize", resizeCanvas);
                setTimeout(() => resizeCanvas(), 100);
                modalContainer.querySelector('.clear-signature-btn').addEventListener('click', () => signaturePad.clear());
            }
            modalContainer.querySelector('#close-modal-btn').addEventListener('click', this.closeModal);
            modalContainer.querySelector('#cancel-modal-btn').addEventListener('click', this.closeModal);
            if (submitHandler) {
                document.getElementById('modal-form').addEventListener('submit', submitHandler);
            }
        },
        closeModal() {
            document.getElementById('modal-container').classList.add('hidden');
            if (signaturePad) {
                signaturePad.clear();
            }
            signaturePad = null;
        }
    };

    // ===================================================================
    // MÓDULO DE GESTIÓN DE RESIDUOS (CON CAMPO CONTENEDOR)
    // ===================================================================
    const WasteModule = {
        currentTypeId: 'special_waste',
        currentPage: 0,
        recordsPerPage: 15,
        currentFilters: {},
        lastSuccessfulEntry: {
            date: null
        },
        config: {
            'special_waste': {
                tableName: 'special_waste',
                title: 'Especiales',
                hasTime: false,
                columns: ['date', 'unit_id', 'waste_type', 'container_type', 'weight_kg'],
                columnHeaders: ['Fecha', 'Unidad', 'Categoría', 'Contenedor', 'Peso (kg)'],
                categoryOptions: wasteTypeOptions.special.map(o => ({ value: o, text: o }))
            },
            'hazardous_waste': {
                tableName: 'hazardous_waste',
                title: 'Peligrosos',
                hasTime: false,
                columns: ['date', 'unit_id', 'waste_type', 'container_type', 'weight_kg'],
                columnHeaders: ['Fecha', 'Unidad', 'Categoría', 'Contenedor', 'Peso (kg)'],
                categoryOptions: wasteTypeOptions.hazardous.map(o => ({ value: o, text: o }))
            },
            'assimilable_waste': {
                tableName: 'assimilable_waste',
                title: 'Asimilables',
                hasTime: true,
                columns: ['date', 'unit_id', 'weight_kg'],
                columnHeaders: ['Fecha y Hora', 'Unidad', 'Peso (kg)'],
                categoryOptions: null
            }
        },

        init() {
            const wasteTabs = document.querySelectorAll('.waste-tab-btn');
            wasteTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    wasteTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.switchWasteType(tab.dataset.wasteType);
                });
            });
            this.renderLayout();
        },

        switchWasteType(newType) {
            this.currentTypeId = newType;
            this.currentPage = 0;
            this.currentFilters = {};
            this.lastSuccessfulEntry = { date: null };
            this.renderLayout();
        },

        renderLayout() {
            const container = document.getElementById('waste-content');
            container.innerHTML = `
                <div id="waste-form-container"></div>
                <div class="table-container card">
                    <div id="filter-bar"></div>
                    <div id="waste-table-wrapper"></div>
                    <div id="pagination-controls"></div>
                </div>
            `;
            this.renderForm();
            this.renderFilterBar();
            this.loadAndRenderRecords();
        },

        renderForm() {
            const container = document.getElementById('waste-form-container');
            const config = this.config[this.currentTypeId];
            const unitOptions = unitsCache.map(u => ({ value: u.id, text: u.name }));
            const hasCategory = !!config.categoryOptions;
            const hasContainer = config.columns.includes('container_type');

            let dateInputHTML;
            if (config.hasTime) {
                const datetimeValue = this.lastSuccessfulEntry.date || getCurrentDateTimeLocal();
                dateInputHTML = `
                    <div class="form-group">
                        <label for="event_datetime">Fecha y Hora</label>
                        <input id="event_datetime" type="datetime-local" name="date" value="${datetimeValue}" class="form-input" required>
                    </div>`;
            } else {
                const dateValue = this.lastSuccessfulEntry.date || new Date().toISOString().split('T')[0];
                dateInputHTML = `
                    <div class="form-group">
                        <label for="event_date">Fecha</label>
                        <input id="event_date" type="date" name="date" value="${dateValue}" class="form-input" required>
                    </div>`;
            }
            
            const containerInputHTML = hasContainer ? `
                <div class="form-group">
                    <label for="container_type">Contenedor</label>
                    <select id="container_type" name="container_type" class="form-input" required>
                        ${containerOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                    </select>
                </div>` : '';

            container.innerHTML = `
                <details class="card" style="margin-bottom: 1.5rem;" open>
                    <summary class="form-toggle-summary">
                        <span class="icon-container">
                             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                        </span>
                        Añadir Nuevo Registro de Residuos ${config.title}
                    </summary>
                    <form id="waste-form" class="waste-form-grid">
                        <div class="form-group" style="grid-column: 1 / -1;">
                            <label for="unit_id_search">Unidad</label>
                            ${this.createSearchableDropdown('unit_id', unitOptions, 'Seleccione o busque una unidad')}
                        </div>
                        ${dateInputHTML}
                        ${hasCategory ? `
                        <div class="form-group">
                            <label for="waste_type_search">Categoría</label>
                            ${this.createSearchableDropdown('waste_type', config.categoryOptions, 'Seleccione una categoría')}
                        </div>` : ''}
                        ${containerInputHTML}
                        <div class="form-group">
                            <label for="waste-weight">Peso (kg)</label>
                            <input id="waste-weight" type="number" step="any" name="weight_kg" placeholder="Ej: 5.4" class="form-input" required>
                        </div>
                        <div class="form-submit-area" style="grid-column: 1 / -1;">
                            <button type="submit" class="btn btn-primary">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                                Guardar Registro
                            </button>
                        </div>
                    </form>
                </details>`;

            this.setupSearchableDropdownEvents('unit_id');
            if (hasCategory) {
                this.setupSearchableDropdownEvents('waste_type');
            }
            document.getElementById('waste-form').addEventListener('submit', this.handleFormSubmit.bind(this));
        },

        renderFilterBar() {
            const container = document.getElementById('filter-bar');
            const config = this.config[this.currentTypeId];
            const hasCategory = !!config.categoryOptions;
            const hasContainer = config.columns.includes('container_type');

            const containerFilterHTML = hasContainer ? `
                <div class="form-group">
                    <label>Contenedor</label>
                    <select id="filter-container-type" class="form-input">
                        <option value="">Todos</option>
                        ${containerOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                    </select>
                </div>` : '';

            container.innerHTML = `
                <div class="filter-grid">
                    <div class="form-group">
                        <label>Fecha Desde</label>
                        <input type="date" id="filter-date-start" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Fecha Hasta</label>
                        <input type="date" id="filter-date-end" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Unidad</label>
                        ${this.createSearchableDropdown('filter_unit_id', unitsCache.map(u => ({ value: u.id, text: u.name })), 'Todas las unidades', true)}
                    </div>
                    ${hasCategory ? `
                    <div class="form-group">
                        <label>Categoría</label>
                        <input type="text" id="filter-waste-type" class="form-input" placeholder="Buscar por nombre...">
                    </div>` : ''}
                    ${containerFilterHTML}
                    <div class="filter-actions">
                        <button id="apply-filters-btn" class="btn btn-primary" title="Aplicar Filtros">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                            Filtrar
                        </button>
                        <button id="clear-filters-btn" class="btn btn-secondary" title="Limpiar Filtros">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
            `;

            this.setupSearchableDropdownEvents('filter_unit_id');
            document.getElementById('apply-filters-btn').addEventListener('click', () => this.applyFilters());
            document.getElementById('clear-filters-btn').addEventListener('click', () => this.clearFilters());
        },

        renderTable(records) {
            const wrapper = document.getElementById('waste-table-wrapper');
            const config = this.config[this.currentTypeId];

            if (!records || records.length === 0) {
                wrapper.innerHTML = '<p class="text-secondary text-center" style="padding: 2rem;">No se encontraron registros que coincidan con los criterios de búsqueda.</p>';
                return;
            }

            const headers = [...config.columnHeaders, 'Acciones'].map(h => `<th>${h}</th>`).join('');
            const rows = records.map(rec => {
                const cells = config.columns.map(col => {
                    let value;
                    switch (col) {
                        case 'date':
                            if (config.hasTime && rec.date) {
                                value = new Date(rec.date).toLocaleString('es-CL', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                            } else if (rec.date) {
                                value = new Date(rec.date + 'T00:00:00').toLocaleDateString('es-CL', { timeZone: 'UTC' });
                            } else {
                                value = 'N/A';
                            }
                            break;
                        case 'unit_id':
                            value = rec.units?.name || 'Unidad no encontrada';
                            break;
                        case 'weight_kg':
                            return `<td class="text-right">${(rec[col] || 0).toFixed(2)}</td>`;
                        default:
                            value = rec[col] || 'N/A';
                    }
                    return `<td>${value}</td>`;
                }).join('');

                const actions = `
                    <td class="actions-cell">
                        <button class="btn-icon btn-edit" data-id="${rec.id}" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                        <button class="btn-icon btn-danger" data-id="${rec.id}" title="Eliminar"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                    </td>`;
                
                return `<tr>${cells}${actions}</tr>`;
            }).join('');

            wrapper.innerHTML = `
                <table class="data-table">
                    <thead><tr>${headers}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;

            wrapper.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', (e) => this.openEditModal(e.currentTarget.dataset.id)));
            wrapper.querySelectorAll('.btn-danger').forEach(btn => btn.addEventListener('click', (e) => this.handleDelete(e.currentTarget.dataset.id)));
        },

        renderPagination(totalRecords) {
            const container = document.getElementById('pagination-controls');
            if (!totalRecords) {
                container.innerHTML = '';
                return;
            }
            const totalPages = Math.ceil(totalRecords / this.recordsPerPage);
            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }
            container.innerHTML = `
                <button id="prev-page-btn" class="btn btn-secondary" ${this.currentPage === 0 ? 'disabled' : ''}>Anterior</button>
                <span>Página ${this.currentPage + 1} de ${totalPages}</span>
                <button id="next-page-btn" class="btn btn-secondary" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''}>Siguiente</button>
            `;
            document.getElementById('prev-page-btn')?.addEventListener('click', () => {
                this.currentPage--;
                this.loadAndRenderRecords();
            });
            document.getElementById('next-page-btn')?.addEventListener('click', () => {
                this.currentPage++;
                this.loadAndRenderRecords();
            });
        },

        async loadAndRenderRecords() {
            const tableWrapper = document.getElementById('waste-table-wrapper');
            tableWrapper.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';

            const config = this.config[this.currentTypeId];
            const from = this.currentPage * this.recordsPerPage;
            const to = from + this.recordsPerPage - 1;

            let query = supabase.from(config.tableName)
                                .select('*, units(name)', { count: 'exact' });
            
            const { startDate, endDate, unitId, wasteTypeSearch, containerType } = this.currentFilters;
            if (startDate) query = query.gte('date', startDate);
            if (endDate) query = query.lte('date', endDate);
            if (unitId) query = query.eq('unit_id', unitId);
            if (containerType) query = query.eq('container_type', containerType);
            
            if (wasteTypeSearch && config.columns.includes('waste_type')) {
                query = query.ilike('waste_type', `%${wasteTypeSearch}%`);
            }
            
            query = query.order('date', { ascending: false });

            const { data, error, count } = await query.range(from, to);

            if (error) {
                tableWrapper.innerHTML = `<p class="text-danger text-center">Error al cargar los registros: ${error.message}</p>`;
                document.getElementById('pagination-controls').innerHTML = '';
                return;
            }
            
            this.renderTable(data);
            this.renderPagination(count);
        },

        applyFilters() {
            this.currentPage = 0;
            this.currentFilters = {
                startDate: document.getElementById('filter-date-start').value || null,
                endDate: document.getElementById('filter-date-end').value || null,
                unitId: document.getElementById('filter_unit_id_value').value || null,
                wasteTypeSearch: document.getElementById('filter-waste-type')?.value || null,
                containerType: document.getElementById('filter-container-type')?.value || null,
            };
            this.loadAndRenderRecords();
        },

        clearFilters() {
            this.currentPage = 0;
            this.currentFilters = {};
            this.renderFilterBar();
            this.loadAndRenderRecords();
        },

        async handleFormSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            button.innerHTML = '<div class="loader" style="width:20px; height:20px; border-width:3px; margin: auto;"></div>';

            const formData = new FormData(form);
            const recordToInsert = Object.fromEntries(formData.entries());
            
            if (this.config[this.currentTypeId].hasTime) {
                recordToInsert.date = new Date(recordToInsert.date).toISOString();
            }
            
            this.lastSuccessfulEntry.date = recordToInsert.date;

            const { error } = await supabase.from(this.config[this.currentTypeId].tableName).insert([recordToInsert]);

            button.disabled = false;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Guardar Registro';
            
            if (error) {
                alert(`Error al guardar el registro: ${error.message}`);
                this.lastSuccessfulEntry = { date: null };
            } else {
                alert('Registro añadido con éxito.');
                form.reset();
                if (this.config[this.currentTypeId].hasTime) {
                    document.getElementById('event_datetime').value = this.lastSuccessfulEntry.date;
                } else {
                    document.getElementById('event_date').value = this.lastSuccessfulEntry.date;
                }
                document.getElementById('waste-weight').focus();
                this.loadAndRenderRecords();
            }
        },
        
        async handleDelete(recordId) {
            const confirmationHTML = `<p>¿Está seguro de que desea eliminar este registro?</p><p class="text-danger">Esta acción no se puede deshacer.</p>`;
            EquipmentModule.createModal('Confirmar Eliminación', confirmationHTML, 'Eliminar', async (e) => {
                e.preventDefault();
                const { error } = await supabase.from(this.config[this.currentTypeId].tableName).delete().eq('id', recordId);
                if (error) {
                    alert('Error al eliminar el registro: ' + error.message);
                } else {
                    alert('Registro eliminado con éxito.');
                    EquipmentModule.closeModal();
                    this.loadAndRenderRecords();
                }
            }, false, 'btn-danger');
        },

        async openEditModal(recordId) {
            const config = this.config[this.currentTypeId];
            const { data: record, error } = await supabase.from(config.tableName).select('*').eq('id', recordId).single();

            if (error || !record) {
                alert('No se pudo cargar el registro para editar.');
                return;
            }

            const hasCategory = !!config.categoryOptions;
            const hasContainer = config.columns.includes('container_type');
            let dateInputHTML;

            if (config.hasTime) {
                const dateForInput = new Date(record.date);
                dateForInput.setMinutes(dateForInput.getMinutes() - dateForInput.getTimezoneOffset());
                const datetimeValue = dateForInput.toISOString().slice(0, 16);
                dateInputHTML = `
                    <div class="form-group">
                        <label for="edit_date">Fecha y Hora</label>
                        <input id="edit_date" type="datetime-local" name="date" value="${datetimeValue}" class="form-input" required>
                    </div>`;
            } else {
                dateInputHTML = `
                    <div class="form-group">
                        <label for="edit_date">Fecha</label>
                        <input id="edit_date" type="date" name="date" value="${record.date}" class="form-input" required>
                    </div>`;
            }

            const containerInputHTML = hasContainer ? `
                <div class="form-group">
                    <label for="edit_container_type">Contenedor</label>
                    <select id="edit_container_type" name="container_type" class="form-input" required>
                        ${containerOptions.map(opt => `<option value="${opt}" ${record.container_type === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                </div>` : '';
            
            const formHTML = `
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label for="edit_unit_id_search">Unidad</label>
                    ${this.createSearchableDropdown('edit_unit_id', unitsCache.map(u => ({value: u.id, text: u.name})), 'Seleccione una unidad')}
                </div>
                ${dateInputHTML}
                ${hasCategory ? `
                <div class="form-group">
                    <label for="edit_waste_type_search">Categoría</label>
                    ${this.createSearchableDropdown('edit_waste_type', config.categoryOptions, 'Seleccione una categoría')}
                </div>` : ''}
                ${containerInputHTML}
                <div class="form-group">
                    <label for="edit_weight_kg">Peso (kg)</label>
                    <input id="edit_weight_kg" type="number" step="any" name="weight_kg" value="${record.weight_kg}" class="form-input" required>
                </div>`;

            EquipmentModule.createModal('Editar Registro', formHTML, 'Guardar Cambios', (e) => this.handleUpdate(e, record.id));
            
            this.setupSearchableDropdownEvents('edit_unit_id', record.unit_id);
            if (hasCategory) {
                this.setupSearchableDropdownEvents('edit_waste_type', record.waste_type);
            }
        },

        async handleUpdate(e, recordId) {
            e.preventDefault();
            const form = e.target;
            const button = document.querySelector('.modal-footer .btn-primary');
            button.disabled = true;

            const formData = new FormData(form);
            const recordToUpdate = {
                unit_id: formData.get('edit_unit_id'),
                waste_type: formData.get('waste_type') || null,
                container_type: formData.get('container_type') || null,
                weight_kg: formData.get('weight_kg'),
                date: formData.get('date'),
            };

            if (this.config[this.currentTypeId].hasTime) {
                recordToUpdate.date = new Date(recordToUpdate.date).toISOString();
            }

            const { error } = await supabase.from(this.config[this.currentTypeId].tableName).update(recordToUpdate).eq('id', recordId);

            if (error) {
                alert('Error al actualizar el registro: ' + error.message);
                button.disabled = false;
            } else {
                alert('Registro actualizado con éxito.');
                EquipmentModule.closeModal();
                this.loadAndRenderRecords();
            }
        },
        
        createSearchableDropdown(name, options, placeholder, isFilter = false) {
            const required = isFilter ? '' : 'required';
            const clearOption = isFilter ? '<div class="searchable-dropdown-item" data-value="">-- Todas --</div>' : '';

            return `
                <div class="searchable-dropdown-container" id="sdd-${name}-container">
                    <input type="text" id="${name}_search" class="searchable-dropdown-input form-input" placeholder="${placeholder}" autocomplete="off">
                    <input type="hidden" name="${name.replace('filter_', '')}" id="${name}_value" ${required}>
                    <div class="searchable-dropdown-list hidden">
                        ${clearOption}
                        ${options.map(opt => `<div class="searchable-dropdown-item" data-value="${opt.value}">${opt.text}</div>`).join('')}
                    </div>
                </div>`;
        },

        setupSearchableDropdownEvents(name, selectedValue = '') {
            const container = document.getElementById(`sdd-${name}-container`);
            if(!container) return;

            const searchInput = container.querySelector('.searchable-dropdown-input');
            const hiddenInput = container.querySelector(`#${name}_value`);
            const list = container.querySelector('.searchable-dropdown-list');
            let highlightedIndex = -1;

            const updateHighlight = () => {
                const items = list.querySelectorAll('.searchable-dropdown-item:not([style*="display: none"])');
                items.forEach((item, index) => {
                    item.classList.toggle('highlighted', index === highlightedIndex);
                });
            };

            const selectItem = (item) => {
                searchInput.value = item.dataset.value === "" ? "" : item.textContent;
                hiddenInput.value = item.dataset.value;
                list.classList.add('hidden');
            };
            
            if (selectedValue) {
                const selectedOption = Array.from(list.querySelectorAll('.searchable-dropdown-item')).find(item => item.dataset.value == selectedValue);
                if (selectedOption) {
                    searchInput.value = selectedOption.textContent;
                    hiddenInput.value = selectedValue;
                }
            }

            searchInput.addEventListener('focus', () => list.classList.remove('hidden'));
            searchInput.addEventListener('input', () => {
                const filter = searchInput.value.toLowerCase();
                list.querySelectorAll('.searchable-dropdown-item').forEach(item => {
                    const isVisible = item.textContent.toLowerCase().includes(filter);
                    item.style.display = isVisible ? '' : 'none';
                });
                highlightedIndex = 0;
                updateHighlight();
            });

            searchInput.addEventListener('keydown', (e) => {
                const visibleItems = Array.from(list.querySelectorAll('.searchable-dropdown-item:not([style*="display: none"])'));
                if (visibleItems.length === 0) return;
                switch (e.key) {
                    case 'ArrowDown': e.preventDefault(); highlightedIndex = (highlightedIndex + 1) % visibleItems.length; updateHighlight(); break;
                    case 'ArrowUp': e.preventDefault(); highlightedIndex = (highlightedIndex - 1 + visibleItems.length) % visibleItems.length; updateHighlight(); break;
                    case 'Enter': e.preventDefault(); if (highlightedIndex >= 0 && visibleItems[highlightedIndex]) { selectItem(visibleItems[highlightedIndex]); } break;
                    case 'Escape': list.classList.add('hidden'); break;
                }
            });

            list.addEventListener('click', (e) => {
                const item = e.target.closest('.searchable-dropdown-item');
                if (item) selectItem(item);
            });
        }

    };

    // --- PUNTO DE ENTRADA DE LA APP ---
    logoutBtn.addEventListener('click', () => Auth.signOut());
    Auth.checkSession();

});


