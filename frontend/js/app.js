// ===================================
// Data Storage & State Management
// ===================================

class TaskManager {
    constructor() {
        this.tasks = [];
        this.roommates = [];
        this.users = [];
        this.assignments = [];
        this.activities = [];
        this.wasteBinEntries = [];
        this.assignmentHistory = [];
        this.currentTaskId = null;
        this.currentRoommateId = null;
        this.currentCompleteTaskId = null;
        this.editingTaskId = null;
        this.editingRoommateId = null;
        this.currentUser = null;
        // Expense-related properties
        this.expenseGroups = [];
        this.currentGroupId = null;
        this.currentGroupDetails = null;
        this.expenseCategories = [];
        // Performance optimization: debounce timer
        this.validateDebounceTimer = null;
        
        // Bind event handlers once to prevent memory leaks
        this._boundHandleCustomSplitChange = this._boundHandleCustomSplitChange.bind(this);
        this._boundHandleCustomSplitInput = this._boundHandleCustomSplitInput.bind(this);
        
        // Cache for DOM elements to optimize validation
        this._cachedElements = {};
        
        this.init();
    }
    
    // Event handler methods for custom splits (bound in constructor)
    _boundHandleCustomSplitChange(e) {
        if (e.target.type === 'checkbox') {
            const memberId = e.target.dataset.memberId;
            this.toggleCustomSplitInput(memberId);
        }
    }
    
    _boundHandleCustomSplitInput(e) {
        if (e.target.type === 'number') {
            this.validateCustomSplitsDebounced();
        }
    }

    async init() {
        // Check authentication first
        const isAuthenticated = await this.checkAuth();
        if (!isAuthenticated) {
            window.location.href = 'login.html';
            return;
        }
        
        this.updateCurrentDate();
        this.setupEventListeners();
        this.populateMonthFilter();
        await this.loadAllData();
    }

    // ================= AUTHENTICATION =================
    async checkAuth() {
        try {
            const response = await fetch("/api/auth/status", {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.authenticated) {
                this.currentUser = data.user;
                this.updateUserDisplay();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    }

    updateUserDisplay() {
        const userDisplayEl = document.getElementById('user-display');
        if (userDisplayEl && this.currentUser) {
            const roleLabel = this.currentUser.role === 'admin' ? ' (Admin)' : '';
            const avatarHtml = this.currentUser.photo
                ? `<img src="/uploads/${this.currentUser.photo}" alt="${this.currentUser.username}" class="user-display-avatar">`
                : '<span class="user-display-icon">👤</span>';

            userDisplayEl.innerHTML = `
                ${avatarHtml}
                <span class="user-display-name">${this.currentUser.username}${roleLabel}</span>
            `;
            
            // Make user display clickable to navigate to profile page
            userDisplayEl.style.cursor = 'pointer';
            userDisplayEl.onclick = () => {
                window.location.href = 'profile.html';
            };
        }
        
        // Show/hide admin-only features
        this.updateAdminFeatures();
    }

    updateAdminFeatures() {
        const isAdmin = this.currentUser && this.currentUser.role === 'admin';
        
        // Admin-only buttons
        const adminElements = [
            'assign-tasks-btn',
            'add-task-btn',
            'password-reset-btn',
            'create-group-btn'
        ];
        
        adminElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = isAdmin ? '' : 'none';
            }
        });
        
        // Store admin status for use in other methods
        this.isAdmin = isAdmin;
    }

    isUserAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    }

    async logout() {
        if (!confirm('Are you sure you want to logout?')) {
            return;
        }

        try {
            const response = await fetch("/api/auth/logout", {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                window.location.href = 'login.html';
            } else {
                this.showNotification('Logout failed', 'error');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('Logout failed', 'error');
        }
    }

    // ================= API LOAD =================
    async loadAllData() {
        try {
            const [tasksRes, roommatesRes, usersRes, assignmentsRes, activitiesRes, wasteBinRes] = await Promise.all([
                fetch("/api/tasks", { credentials: 'include' }),
                fetch("/api/roommates", { credentials: 'include' }),
                fetch("/api/users", { credentials: 'include' }),
                fetch("/api/assignments", { credentials: 'include' }),
                fetch("/api/activities", { credentials: 'include' }),
                fetch("/api/waste-bin", { credentials: 'include' })
            ]);

            if (!tasksRes.ok || !roommatesRes.ok || !usersRes.ok || !assignmentsRes.ok || !activitiesRes.ok || !wasteBinRes.ok) {
                // If unauthorized, redirect to login
                if (tasksRes.status === 401 || roommatesRes.status === 401 || usersRes.status === 401 ||
                    assignmentsRes.status === 401 || activitiesRes.status === 401 ||
                    wasteBinRes.status === 401) {
                    window.location.href = 'login.html';
                    return;
                }
                throw new Error('Failed to fetch data');
            }

            this.tasks = await tasksRes.json();
            this.roommates = await roommatesRes.json();
            this.users = await usersRes.json();
            this.assignments = await assignmentsRes.json();
            this.activities = await activitiesRes.json();
            this.wasteBinEntries = await wasteBinRes.json();

            this.renderDashboard();
            this.renderTasks();
            this.renderRoommates();
            this.renderWasteBin();
            this.renderStatistics();
            this.renderRecentActivity();

        } catch (err) {
            console.error("API load error:", err);
            this.showNotification("Failed to load data. Make sure the backend server is running.", "error");
        }
    }

    // ================= DATE =================
    updateCurrentDate() {
        const el = document.getElementById('current-date');
        if (el) {
            el.textContent = new Date().toDateString();
        }
    }

    // ================= MONTH FILTER =================
    populateMonthFilter() {
        const select = document.getElementById('task-filter-month');
        if (!select) return;

        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];

        const currentYear = new Date().getFullYear();
        months.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = `${currentYear}-${String(index + 1).padStart(2, '0')}`;
            option.textContent = `${month} ${currentYear}`;
            select.appendChild(option);
        });
    }

    // ================= EVENTS =================
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.switchView(e.target.dataset.view);
            });
        });

        const wasteBinForm = document.getElementById('waste-bin-form');
        if (wasteBinForm) {
            wasteBinForm.onsubmit = (e) => this.saveWasteBinEntry(e);
        }

        // Task Modal
        document.getElementById('add-task-btn').onclick = () => this.openTaskModal();
        document.getElementById('task-form').onsubmit = (e) => this.saveTask(e);
        document.getElementById('cancel-task-btn').onclick = () => this.closeTaskModal();

        // Roommate Modal - Add button removed, only edit functionality remains
        document.getElementById('roommate-form').onsubmit = (e) => this.saveRoommate(e);
        document.getElementById('cancel-roommate-btn').onclick = () => this.closeRoommateModal();

        // Roommate photo preview
        const roommatePhoto = document.getElementById('roommate-photo');
        if (roommatePhoto) {
            roommatePhoto.onchange = (e) => this.previewImage(e, 'roommate-photo-preview');
        }

        // Complete Task Modal
        const completeTaskForm = document.getElementById('complete-task-form');
        if (completeTaskForm) {
            completeTaskForm.onsubmit = (e) => this.completeTask(e);
        }
        const cancelCompleteBtn = document.getElementById('cancel-complete-btn');
        if (cancelCompleteBtn) {
            cancelCompleteBtn.onclick = () => this.closeCompleteTaskModal();
        }

        // Completion photo preview
        const completionPhoto = document.getElementById('completion-photo');
        if (completionPhoto) {
            completionPhoto.onchange = (e) => this.previewImage(e, 'photo-preview');
        }

        // Assign tasks
        document.getElementById('assign-tasks-btn').onclick = () => this.assignTasksRandomly();

        // Password Reset Modal
        const passwordResetForm = document.getElementById('password-reset-form');
        if (passwordResetForm) {
            passwordResetForm.onsubmit = (e) => this.resetUserPassword(e);
        }
        const cancelPasswordResetBtn = document.getElementById('cancel-password-reset-btn');
        if (cancelPasswordResetBtn) {
            cancelPasswordResetBtn.onclick = () => this.closePasswordResetModal();
        }

        // Expense Management
        const createGroupBtn = document.getElementById('create-group-btn');
        if (createGroupBtn) {
            createGroupBtn.onclick = () => this.openExpenseGroupModal();
        }
        const expenseGroupForm = document.getElementById('expense-group-form');
        if (expenseGroupForm) {
            expenseGroupForm.onsubmit = (e) => this.saveExpenseGroup(e);
        }
        const cancelGroupBtn = document.getElementById('cancel-group-btn');
        if (cancelGroupBtn) {
            cancelGroupBtn.onclick = () => this.closeExpenseGroupModal();
        }
        
        const addExpenseBtn = document.getElementById('add-expense-btn');
        if (addExpenseBtn) {
            addExpenseBtn.onclick = () => this.openAddExpenseModal();
        }
        const addExpenseForm = document.getElementById('add-expense-form');
        if (addExpenseForm) {
            addExpenseForm.onsubmit = (e) => this.saveExpense(e);
        }
        const cancelExpenseBtn = document.getElementById('cancel-expense-btn');
        if (cancelExpenseBtn) {
            cancelExpenseBtn.onclick = () => this.closeAddExpenseModal();
        }
        
        const manageMembersBtn = document.getElementById('manage-members-btn');
        if (manageMembersBtn) {
            manageMembersBtn.onclick = () => this.openManageMembersModal();
        }
        const cancelManageMembersBtn = document.getElementById('cancel-manage-members-btn');
        if (cancelManageMembersBtn) {
            cancelManageMembersBtn.onclick = () => this.closeManageMembersModal();
        }
        const saveMembersBtn = document.getElementById('save-members-btn');
        if (saveMembersBtn) {
            saveMembersBtn.onclick = () => this.saveGroupMembers();
        }
        
        const backToGroupsBtn = document.getElementById('back-to-groups-btn');
        if (backToGroupsBtn) {
            backToGroupsBtn.onclick = () => this.switchView('expenses');
        }

        // Filters
        const statusFilter = document.getElementById('task-filter-status');
        const monthFilter = document.getElementById('task-filter-month');
        if (statusFilter) {
            statusFilter.onchange = () => this.renderTasks();
        }
        if (monthFilter) {
            monthFilter.onchange = () => this.renderTasks();
        }
        
        // Expense user filter
        const expenseUserFilter = document.getElementById('expense-user-filter');
        if (expenseUserFilter) {
            expenseUserFilter.onchange = () => {
                if (this.currentGroupDetails && this.currentGroupDetails.expenses) {
                    this.renderGroupExpenses(this.currentGroupDetails.expenses, expenseUserFilter.value);
                }
            };
        }

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.onclick = (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                }
            };
        });

        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            };
        });
    }


    // ================= IMAGE PREVIEW =================
    previewImage(event, previewId) {
        const file = event.target.files[0];
        const preview = document.getElementById(previewId);
        
        if (file && preview) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `<img src="${e.target.result}" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        }
    }

    // ================= TASK =================
    async saveTask(e) {
        e.preventDefault();

        // Prevent multiple submissions
        if (this.isSubmitting) {
            return;
        }

        const nameInput = document.getElementById("task-name");
        const name = nameInput ? nameInput.value.trim() : "";
        const frequencyInput = document.getElementById("task-frequency");
        const frequency = frequencyInput ? frequencyInput.value : "one-time";
        const durationInput = document.getElementById("task-duration");
        const duration = durationInput ? durationInput.value : "";

        // Validate task name
        if (!name) {
            this.showNotification("Please enter a task name", "error");
            if (nameInput) nameInput.focus();
            return;
        }

        // Validate task name length
        if (name.length > 100) {
            this.showNotification("Task name must be 100 characters or less", "error");
            if (nameInput) nameInput.focus();
            return;
        }

        this.isSubmitting = true;

        try {
            const url = this.editingTaskId ? `/api/tasks/${this.editingTaskId}` : "/api/tasks";
            const method = this.editingTaskId ? "PUT" : "POST";
            
            const payload = {
                name: name,
                frequency: frequency,
                duration: duration || null
            };

            // Manual assignment is an admin-only edit feature.
            if (this.editingTaskId && this.isUserAdmin()) {
                const assigneeSelect = document.getElementById("task-assignee");
                payload.assigneeId = assigneeSelect ? (assigneeSelect.value || null) : null;
            }

            console.log("Sending task data:", payload);
            
            const response = await fetch(url, {
                method: method,
                headers: {"Content-Type": "application/json"},
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Server error:", errorData);
                throw new Error(errorData.error || `Failed to save task (${response.status})`);
            }

            const message = this.editingTaskId ? "Task updated successfully!" : "Task added successfully!";
            this.showNotification(message, "success");
            this.editingTaskId = null;
            this.closeTaskModal();
            await this.loadAllData();
        } catch (err) {
            console.error("Save task error:", err);
            this.showNotification(err.message || "Failed to save task", "error");
        } finally {
            this.isSubmitting = false;
        }
    }

    // ================= ROOMMATE =================
    async saveRoommate(e) {
        e.preventDefault();

        // Prevent multiple submissions
        if (this.isSubmitting) {
            return;
        }

        this.isSubmitting = true;

        const formData = new FormData();
        formData.append("name", document.getElementById("roommate-name").value);

        const file = document.getElementById("roommate-photo").files[0];
        if (file) formData.append("photo", file);

        try {
            const url = this.editingRoommateId ? `/api/roommates/${this.editingRoommateId}` : "/api/roommates";
            const method = this.editingRoommateId ? "PUT" : "POST";
            
            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to save roommate');
            }

            const message = this.editingRoommateId ? "Roommate updated successfully!" : "Roommate added successfully!";
            this.showNotification(message, "success");
            this.editingRoommateId = null;
            this.closeRoommateModal();
            await this.loadAllData();
        } catch (err) {
            console.error("Save roommate error:", err);
            this.showNotification(err.message || "Failed to save roommate", "error");
        } finally {
            this.isSubmitting = false;
        }
    }

    async deleteRoommate(roommateId) {
        const roommate = this.roommates.find(r => r.id === roommateId);
        const roommateName = roommate ? roommate.name : 'this roommate';
        
        if (!confirm(`Are you sure you want to delete "${roommateName}"? This will also remove all assignments for this roommate.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/roommates/${roommateId}`, {
                method: "DELETE",
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to delete roommate');
            }

            this.showNotification("Roommate deleted successfully!", "success");
            await this.loadAllData();
        } catch (err) {
            console.error("Delete roommate error:", err);
            this.showNotification("Failed to delete roommate", "error");
        }
    }

    editRoommate(roommateId) {
        this.openRoommateModal(roommateId);
    }

    // ================= COMPLETE TASK =================
    openCompleteTaskModal(taskId) {
        this.currentCompleteTaskId = taskId;
        document.getElementById("complete-task-modal").classList.add("active");
    }

    closeCompleteTaskModal() {
        this.currentCompleteTaskId = null;
        document.getElementById("complete-task-modal").classList.remove("active");
        document.getElementById("complete-task-form").reset();
        document.getElementById("photo-preview").innerHTML = '';
    }

    async completeTask(e) {
        e.preventDefault();

        // Prevent multiple submissions
        if (this.isSubmitting) {
            return;
        }

        const notesInput = document.getElementById("completion-notes");
        const photoInput = document.getElementById("completion-photo");
        
        if (!notesInput || !photoInput) {
            this.showNotification("Form elements not found", "error");
            return;
        }

        const notes = notesInput.value.trim();
        const photo = photoInput.files[0];

        // Validate notes
        if (!notes) {
            this.showNotification("Please add completion notes", "error");
            notesInput.focus();
            return;
        }

        // Validate photo
        if (!photo) {
            this.showNotification("Please upload a photo", "error");
            photoInput.focus();
            return;
        }

        // Validate file size (50MB limit)
        const maxSize = 50 * 1024 * 1024; // 50MB in bytes
        if (photo.size > maxSize) {
            this.showNotification("Photo is too large. Maximum size is 50MB", "error");
            photoInput.focus();
            return;
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(photo.type)) {
            this.showNotification("Please upload a valid image file (JPEG, PNG, GIF, or WebP)", "error");
            photoInput.focus();
            return;
        }

        // Find the assignment for this task
        const assignment = this.assignments.find(a => a.task_id === this.currentCompleteTaskId);
        if (!assignment) {
            this.showNotification("Assignment not found", "error");
            console.error("No assignment found for task ID:", this.currentCompleteTaskId);
            return;
        }

        if (assignment.roommate_id !== this.currentUser?.id && !this.isUserAdmin()) {
            this.showNotification("You can only complete your own assigned task", "error");
            return;
        }

        this.isSubmitting = true;

        try {
            const formData = new FormData();
            formData.append("notes", notes);
            formData.append("photo", photo);

            console.log("Completing assignment:", assignment.id, "for task:", this.currentCompleteTaskId);

            const response = await fetch(`/api/assignments/${assignment.id}/complete`, {
                method: "POST",
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error("Server response error:", errorData);
                throw new Error(errorData.error || `Failed to complete task (${response.status})`);
            }

            const result = await response.json();
            console.log("Task completion result:", result);

            this.showNotification("Task marked as complete!", "success");
            this.closeCompleteTaskModal();
            await this.loadAllData();
        } catch (err) {
            console.error("Complete task error:", err);
            this.showNotification(err.message || "Failed to complete task", "error");
        } finally {
            this.isSubmitting = false;
        }
    }

    // ================= ASSIGN =================
    async assignTasksRandomly() {
        if (this.tasks.length === 0) {
            this.showNotification("Please add tasks first", "error");
            return;
        }

        if (this.roommates.length === 0) {
            this.showNotification("Please add roommates first", "error");
            return;
        }

        try {
            const response = await fetch("/api/assign", {
                method: "POST",
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to assign tasks');
            }

            const data = await response.json();

            // Check if there are no unassigned tasks
            if (data.noTasksToAssign) {
                this.showNoTasksInfoBoxes();
                return;
            }

            const message = data.remainingUnassignedCount > 0
                ? `${data.assignedCount} task(s) assigned. ${data.remainingUnassignedCount} extra task(s) left unassigned.`
                : "Tasks assigned successfully!";
            this.showNotification(message, "success");
            await this.loadAllData();
        } catch (err) {
            console.error("Assign error:", err);
            this.showNotification("Failed to assign tasks", "error");
        }
    }

    // ================= SHOW NO TASKS INFO BOXES =================
    showNoTasksInfoBoxes() {
        const container = document.getElementById('notification-container');
        if (!container) return;

        // Clear any existing info boxes
        const existingInfoBoxes = container.querySelectorAll('.info-box');
        existingInfoBoxes.forEach(box => box.remove());

        // Create single info box
        const infoBox = document.createElement('div');
        infoBox.className = 'info-box';
        infoBox.innerHTML = `
            <div class="info-icon">ℹ️</div>
            <div class="info-text">No unassigned tasks to assign</div>
        `;
        
        container.appendChild(infoBox);

        // Auto remove after 5 seconds
        setTimeout(() => {
            infoBox.style.opacity = '0';
            infoBox.style.transform = 'translateX(400px)';
            infoBox.style.transition = 'all 0.3s ease';
            setTimeout(() => infoBox.remove(), 300);
        }, 5000);
    }

    // ================= NOTIFICATIONS =================
    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ================= UI HELPERS =================
    switchView(view) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const viewElement = document.getElementById(view + "-view");
        if (viewElement) {
            viewElement.classList.add('active');
            
            // Load data when switching to specific views
            if (view === 'expenses') {
                this.loadExpenseGroups();
            } else if (view === 'expense-detail' && this.currentGroupId) {
                this.loadGroupDetails(this.currentGroupId);
            } else if (view === 'waste-bin') {
                this.showWasteBinReminder();
            }
        }
    }

    openTaskModal(taskId = null) {
        const modal = document.getElementById("task-modal");
        const modalTitle = document.getElementById("task-modal-title");
        const assignmentGroup = document.getElementById("task-assignment-group");
        const assigneeSelect = document.getElementById("task-assignee");

        // Manual assignment is available only to admins and only while editing.
        if (assignmentGroup) {
            assignmentGroup.style.display = this.isUserAdmin() && taskId ? '' : 'none';
        }

        if (taskId) {
            // Edit mode
            this.editingTaskId = taskId;
            const task = this.tasks.find(t => t.id === taskId);

            if (task) {
                modalTitle.textContent = "Edit Task";
                document.getElementById("task-name").value = task.name;
                document.getElementById("task-frequency").value = task.frequency || 'one-time';
                document.getElementById("task-duration").value = task.duration || '';

                if (assigneeSelect) {
                    const assignment = this.assignments.find(a => a.task_id === taskId);

                    assigneeSelect.innerHTML = `
                        <option value="">Unassigned</option>
                        ${this.users.map(user => `
                            <option value="${user.id}">${user.full_name || user.username}</option>
                        `).join('')}
                    `;

                    assigneeSelect.value = assignment ? String(assignment.roommate_id) : "";
                }
            }
        } else {
            // Add mode
            this.editingTaskId = null;
            modalTitle.textContent = "Add New Task";
            document.getElementById("task-form").reset();

            if (assigneeSelect) {
                assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
                assigneeSelect.value = "";
            }
        }

        modal.classList.add("active");
    }

    closeTaskModal() {
        this.editingTaskId = null;
        document.getElementById("task-modal").classList.remove("active");
    }

    openRoommateModal(roommateId = null) {
        const modal = document.getElementById("roommate-modal");
        const modalTitle = document.getElementById("roommate-modal-title");
        
        if (roommateId) {
            // Edit mode
            this.editingRoommateId = roommateId;
            const roommate = this.roommates.find(r => r.id === roommateId);
            
            if (roommate) {
                modalTitle.textContent = "Edit Roommate";
                document.getElementById("roommate-name").value = roommate.name;
                
                // Show existing photo if available
                if (roommate.photo) {
                    document.getElementById("roommate-photo-preview").innerHTML =
                        `<img src="/uploads/${roommate.photo}" style="max-width: 200px; max-height: 200px; margin-top: 10px; border-radius: 8px;">`;
                }
            }
        } else {
            // Add mode
            this.editingRoommateId = null;
            modalTitle.textContent = "Add New Roommate";
            document.getElementById("roommate-form").reset();
            document.getElementById("roommate-photo-preview").innerHTML = '';
        }
        
        modal.classList.add("active");
    }

    closeRoommateModal() {
        this.editingRoommateId = null;
        document.getElementById("roommate-modal").classList.remove("active");
    }

    // ================= RENDER =================
    renderDashboard() {
        document.getElementById('total-tasks-stat').innerText = this.tasks.length;
        document.getElementById('completed-tasks-stat').innerText =
            this.assignments.filter(a => a.status === 'completed').length;
        document.getElementById('pending-tasks-stat').innerText =
            this.assignments.filter(a => a.status === 'pending').length;
        document.getElementById('total-roommates-stat').innerText = this.roommates.length;

        // Render current assignments
        const assignmentsContainer = document.getElementById('current-assignments');
        if (assignmentsContainer) {
            if (this.assignments.length === 0) {
                assignmentsContainer.innerHTML = '<p class="empty-state">No tasks assigned yet. Click "Assign Tasks Randomly" to get started!</p>';
            } else {
                assignmentsContainer.innerHTML = this.assignments.map(a => `
                    <div class="assignment-item">
                        <strong>${a.task_name}</strong> → ${a.roommate_name}
                        <span class="status-badge status-${a.status || 'pending'}">${a.status || 'pending'}</span>
                    </div>
                `).join('');
            }
        }
    }

    renderTasks() {
        const container = document.getElementById("tasks-list");
        if (!container) return;

        // Get filter values
        const statusFilter = document.getElementById('task-filter-status')?.value || 'all';
        const monthFilter = document.getElementById('task-filter-month')?.value || 'all';

        // Filter tasks
        let filteredTasks = this.tasks.filter(t => {
            const assignment = this.assignments.find(a => a.task_id === t.id);
            const derivedStatus = assignment?.status || t.status || 'pending';

            const matchesStatus = statusFilter === 'all' || derivedStatus === statusFilter;

            if (monthFilter === 'all') {
                return matchesStatus;
            }

            if (!t.created_at) {
                return false;
            }

            const createdDate = new Date(t.created_at);
            const createdMonth = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;

            return matchesStatus && createdMonth === monthFilter;
        });

        if (this.tasks.length === 0) {
            container.innerHTML = '<p class="empty-state">No tasks yet. Add your first task to get started!</p>';
            return;
        }

        if (filteredTasks.length === 0) {
            container.innerHTML = '<p class="empty-state">No tasks match the selected filters.</p>';
            return;
        }

        container.innerHTML = filteredTasks.map(t => {
            // Find assignment for this task
            const assignment = this.assignments.find(a => a.task_id === t.id);
            const assignedName = assignment?.roommate_name || null;
            const assignedPhoto = assignment?.roommate_photo || null;
            const isAssignedToCurrentUser = assignment
                ? assignment.roommate_id === this.currentUser?.id
                : false;
            
            // Check if task is completed (either task status or assignment status)
            const isCompleted = t.status === 'completed' || (assignment && assignment.status === 'completed');
            
            // Format created date
            const createdDate = t.created_at ? new Date(t.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }) : 'N/A';

            // Format completed date
            const completedDate = assignment?.completed_date ? new Date(assignment.completed_date).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }) : null;

            return `
                <div class="task-card-compact">
                    <h3 class="task-title">${t.name}</h3>
                    
                    <div class="task-badges-row">
                        <span class="badge badge-category">✓ ${t.frequency || 'Cleaning'}</span>
                        <span class="badge badge-status ${isCompleted ? 'badge-completed' : 'badge-pending'}">${isCompleted ? 'Completed' : 'Pending'}</span>
                    </div>

                    <div class="task-meta">
                        <span class="task-created-date">📅 Created: ${createdDate}</span>
                    </div>

                    ${assignedName ? `
                        <div class="task-assigned">
                            ${assignedPhoto
                                ? `<img src="/uploads/${assignedPhoto}" alt="${assignedName}" class="assigned-avatar-small assigned-avatar-image-small">`
                                : `<div class="assigned-avatar-small">${assignedName[0].toUpperCase()}</div>`
                            }
                            <span>Assigned to ${assignedName}${isAssignedToCurrentUser ? ' (You)' : ''}</span>
                        </div>
                    ` : ''}

                    ${isCompleted && assignment && assignment.completed_date ? `
                        <div class="task-completion-box">
                            <div class="completion-header">
                                ✅ Completed: ${completedDate}
                            </div>
                            ${assignment.completion_photo ? `
                                <div class="completion-photo-box">
                                    <img src="/uploads/${assignment.completion_photo}" alt="Completion photo">
                                </div>
                            ` : ''}
                            ${assignment.completion_notes ? `
                                <div class="completion-notes-box">
                                    <strong>Notes:</strong> ${assignment.completion_notes}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    <div class="task-actions-row">
                        ${!isCompleted && isAssignedToCurrentUser ? `
                            <button class="btn-task btn-complete" onclick="app.openCompleteTaskModal(${t.id})">
                                ✓ Complete
                            </button>
                        ` : ''}
                        ${this.isUserAdmin() ? `
                            <button class="btn-task btn-edit" onclick="app.editTask(${t.id})">
                                ✏️ Edit
                            </button>
                            <button class="btn-task btn-delete" onclick="app.deleteTask(${t.id})">
                                🗑 Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join("");
    }

    editTask(taskId) {
        this.openTaskModal(taskId);
    }

    async deleteTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        const taskName = task ? task.name : 'this task';
        
        if (!confirm(`Are you sure you want to delete "${taskName}"? This will also remove all assignments for this task.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: "DELETE",
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to delete task');
            }

            this.showNotification("Task deleted successfully!", "success");
            await this.loadAllData();
        } catch (err) {
            console.error("Delete task error:", err);
            this.showNotification("Failed to delete task", "error");
        }
    }

    renderRoommates() {
        const container = document.getElementById("roommates-list");
        if (!container) return;

        if (this.roommates.length === 0) {
            container.innerHTML = '<p class="empty-state">No roommates added yet. Add roommates to start managing tasks!</p>';
            return;
        }

        container.innerHTML = this.roommates.map(r => {
            const assigned = this.assignments.filter(a => a.roommate_name === r.name).length;
            const completed = this.assignments.filter(a => a.roommate_name === r.name && a.status === 'completed').length;

            return `
                <div class="roommate-card roommate-card-modern">
                    <div class="roommate-avatar roommate-avatar-large">
                        ${r.photo ? `<img src="/uploads/${r.photo}" alt="${r.name}">` : `<div class="avatar-placeholder avatar-placeholder-large">${r.name[0].toUpperCase()}</div>`}
                    </div>
                    <h3 class="roommate-name">${r.name}</h3>

                    <div class="roommate-summary-box">
                        <div class="roommate-summary-item">
                            <span class="roommate-summary-number">${completed}</span>
                            <span class="roommate-summary-label">Completed</span>
                        </div>
                        <div class="roommate-summary-item">
                            <span class="roommate-summary-number">${assigned}</span>
                            <span class="roommate-summary-label">Assigned</span>
                        </div>
                    </div>

                    ${this.isUserAdmin() ? `
                        <div class="roommate-actions">
                            <button class="btn btn-primary roommate-action-btn" type="button" onclick="app.editRoommate(${r.id})">✏️ Edit</button>
                            <button class="btn btn-danger roommate-action-btn" type="button" onclick="app.deleteRoommate(${r.id})">🗑 Delete</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join("");
    }

    // Returns { [roommateId]: { id, name, photo, count } } with all users initialised to 0
    _getDumpCounts() {
        const roommateData = {};
        this.users.forEach(user => {
            roommateData[user.id] = {
                id: user.id,
                name: user.full_name || user.username,
                photo: user.photo,
                count: 0
            };
        });
        this.wasteBinEntries.forEach(entry => {
            const id = entry.roommate_id;
            if (roommateData[id]) {
                roommateData[id].count++;
            } else {
                // Entry for a user not in the current users list
                roommateData[id] = {
                    id,
                    name: entry.roommate_name,
                    photo: entry.roommate_photo,
                    count: 1
                };
            }
        });
        return roommateData;
    }

    renderWasteBin() {
        const roommateSelect = document.getElementById('waste-bin-roommate');
        const wasteBinList = document.getElementById('waste-bin-list');

        if (roommateSelect) {
            const currentValue = roommateSelect.value;
            roommateSelect.innerHTML = `
                <option value="">Select roommate</option>
                ${this.users.map(user => `
                    <option value="${user.id}">${user.full_name || user.username}</option>
                `).join('')}
            `;
            roommateSelect.value = currentValue;
        }

        if (!wasteBinList) return;

        if (this.wasteBinEntries.length === 0) {
            wasteBinList.innerHTML = '<p class="empty-state">No waste bin entries yet.</p>';
            return;
        }

        // Calculate dump count for each roommate
        const roommateData = this._getDumpCounts();

        // Sort roommates by count (descending)
        const sortedRoommates = Object.values(roommateData).sort((a, b) => b.count - a.count);

        // Column 1: Chronological history with name and date
        const historyColumn = this.wasteBinEntries.map(entry => {
            const dumpedDate = entry.dumped_date
                ? new Date(entry.dumped_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                })
                : 'N/A';

            return `
                <div class="waste-bin-entry">
                    <div class="waste-bin-entry-avatar">
                        ${entry.roommate_photo
                            ? `<img src="/uploads/${entry.roommate_photo}" alt="${entry.roommate_name}">`
                            : `<div class="waste-bin-avatar-placeholder">${entry.roommate_name[0].toUpperCase()}</div>`
                        }
                    </div>
                    <div class="waste-bin-entry-content">
                        <div class="waste-bin-entry-name">${entry.roommate_name}</div>
                        <div class="waste-bin-entry-date">Dumped on ${dumpedDate}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Column 2: Statistics with name and count (sorted by count descending)
        const statsColumn = sortedRoommates.map(roommate => {
            return `
                <div class="waste-bin-stat-entry">
                    <div class="waste-bin-entry-avatar">
                        ${roommate.photo
                            ? `<img src="/uploads/${roommate.photo}" alt="${roommate.name}">`
                            : `<div class="waste-bin-avatar-placeholder">${roommate.name[0].toUpperCase()}</div>`
                        }
                    </div>
                    <div class="waste-bin-entry-content">
                        <div class="waste-bin-entry-name">${roommate.name}</div>
                        <div class="waste-bin-entry-count">🗑 ${roommate.count} Time${roommate.count !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            `;
        }).join('');

        wasteBinList.innerHTML = `
            <div class="waste-bin-column">
                <div class="waste-bin-column-header">📅 Dump History</div>
                <div class="waste-bin-column-content">
                    <div class="waste-bin-entries">
                        ${historyColumn}
                    </div>
                </div>
            </div>
            <div class="waste-bin-column">
                <div class="waste-bin-column-header">📊 Statistics</div>
                <div class="waste-bin-column-content">
                    <div class="waste-bin-stats">
                        ${statsColumn}
                    </div>
                </div>
            </div>
        `;
    }

    showWasteBinReminder() {
        // Calculate dump count for each roommate (all users initialised to 0)
        const roommateData = this._getDumpCounts();

        // Sort roommates by count (ascending - least dumps first)
        const sortedRoommates = Object.values(roommateData).sort((a, b) => a.count - b.count);
        
        // Get top 3 with least dumps
        const leastDumpers = sortedRoommates.slice(0, 3);
        
        // Create popup HTML
        const popupHTML = `
            <div class="waste-bin-reminder-overlay" id="waste-bin-reminder">
                <div class="waste-bin-reminder-modal">
                    <div class="waste-bin-reminder-header">
                        <h3>🗑️ Waste Bin Reminder</h3>
                        <button class="waste-bin-reminder-close" onclick="app.closeWasteBinReminder()">&times;</button>
                    </div>
                    <div class="waste-bin-reminder-content">
                        <p class="waste-bin-reminder-message">Please consider throwing the waste! Here are the members with the least throw count:</p>
                        <div class="waste-bin-reminder-list">
                            ${leastDumpers.map((roommate, index) => `
                                <div class="waste-bin-reminder-item">
                                    <div class="waste-bin-reminder-rank">#${index + 1}</div>
                                    <div class="waste-bin-reminder-avatar">
                                        ${roommate.photo
                                            ? `<img src="/uploads/${roommate.photo}" alt="${roommate.name}">`
                                            : `<div class="waste-bin-avatar-placeholder">${roommate.name[0].toUpperCase()}</div>`
                                        }
                                    </div>
                                    <div class="waste-bin-reminder-info">
                                        <div class="waste-bin-reminder-name">${roommate.name}</div>
                                        <div class="waste-bin-reminder-count">🗑 ${roommate.count} Time${roommate.count !== 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="waste-bin-reminder-footer">
                        <button class="btn btn-primary" onclick="app.closeWasteBinReminder()">Got it!</button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing reminder if any
        const existingReminder = document.getElementById('waste-bin-reminder');
        if (existingReminder) {
            existingReminder.remove();
        }
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', popupHTML);
        
        // Show with animation
        setTimeout(() => {
            const reminder = document.getElementById('waste-bin-reminder');
            if (reminder) {
                reminder.classList.add('active');
            }
        }, 10);
    }

    closeWasteBinReminder() {
        const reminder = document.getElementById('waste-bin-reminder');
        if (reminder) {
            reminder.classList.remove('active');
            setTimeout(() => {
                reminder.remove();
            }, 300);
        }
    }

    async saveWasteBinEntry(e) {
        e.preventDefault();

        const roommateId = document.getElementById('waste-bin-roommate')?.value;
        const dumpedDate = document.getElementById('waste-bin-date')?.value;

        if (!roommateId || !dumpedDate) {
            this.showNotification('Please select roommate and date', 'error');
            return;
        }

        try {
            const response = await fetch('/api/waste-bin', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    roommateId,
                    dumpedDate
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to save waste bin entry');
            }

            this.showNotification('Waste bin entry added successfully!', 'success');
            document.getElementById('waste-bin-form')?.reset();
            await this.loadAllData();
        } catch (err) {
            console.error('Save waste bin entry error:', err);
            this.showNotification(err.message || 'Failed to save waste bin entry', 'error');
        }
    }

    renderStatistics() {
        const contributionChart = document.getElementById('contribution-chart');
        const categoryChart = document.getElementById('category-chart');
        const detailedStats = document.getElementById('detailed-stats');

        if (!contributionChart || !categoryChart || !detailedStats) return;

        if (this.tasks.length === 0 || this.users.length === 0) {
            contributionChart.innerHTML = '<p class="empty-state">No data available yet</p>';
            categoryChart.innerHTML = '<p class="empty-state">No data available yet</p>';
            detailedStats.innerHTML = '<p class="empty-state">No statistics available yet</p>';
            return;
        }

        // Task Completion by User
        contributionChart.innerHTML = this.users.map(user => {
            const displayName = user.full_name || user.username;
            const assigned = this.assignments.filter(a => a.roommate_id === user.id).length;
            const completed = this.assignments.filter(a => a.roommate_id === user.id && a.status === 'completed').length;
            const percentage = assigned > 0 ? (completed / assigned) * 100 : 0;

            return `
                <div class="stat-bar-item">
                    <div class="stat-bar-header">
                        <span class="stat-bar-label">${displayName}</span>
                        <span class="stat-bar-value">${completed} tasks</span>
                    </div>
                    <div class="stat-bar-container">
                        <div class="stat-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Tasks by Category
        const frequencies = {};
        this.tasks.forEach(t => {
            const category = t.frequency || 'uncategorized';
            frequencies[category] = (frequencies[category] || 0) + 1;
        });

        const totalTasks = this.tasks.length;
        categoryChart.innerHTML = Object.entries(frequencies).map(([category, count]) => {
            const percentage = (count / totalTasks) * 100;
            
            return `
                <div class="stat-bar-item">
                    <div class="stat-bar-header">
                        <span class="stat-bar-label">✓ ${category}</span>
                        <span class="stat-bar-value">${count} tasks</span>
                    </div>
                    <div class="stat-bar-container">
                        <div class="stat-bar-fill stat-bar-gradient" style="width: ${percentage}%">
                            <span class="stat-bar-count">${count}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Detailed Statistics Table
        detailedStats.innerHTML = `
            <table class="stats-table-modern">
                <thead>
                    <tr>
                        <th>Roommate</th>
                        <th>Total Assigned</th>
                        <th>Completed</th>
                        <th>Pending</th>
                        <th>Completion Rate</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.users.map(user => {
                        const displayName = user.full_name || user.username;
                        const assigned = this.assignments.filter(a => a.roommate_id === user.id).length;
                        const completed = this.assignments.filter(a => a.roommate_id === user.id && a.status === 'completed').length;
                        const pending = assigned - completed;
                        const rate = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
                        const avatarLetter = displayName[0].toUpperCase();
                        
                        return `
                            <tr>
                                <td>
                                    <div class="table-roommate">
                                        <div class="table-avatar">${avatarLetter}</div>
                                        <span>${displayName}</span>
                                    </div>
                                </td>
                                <td>${assigned}</td>
                                <td>${completed}</td>
                                <td>${pending}</td>
                                <td>${rate}%</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    renderRecentActivity() {
        const container = document.getElementById('recent-activity');
        if (!container) return;

        if (this.activities.length === 0) {
            container.innerHTML = '<p class="empty-state">No recent activity</p>';
            return;
        }

        container.innerHTML = this.activities.map(activity => {
            const timeAgo = this.getTimeAgo(activity.created_at);
            return `
                <div class="activity-item">
                    <div class="activity-icon">${activity.icon || '📝'}</div>
                    <div class="activity-content">
                        <div class="activity-message">${activity.message}</div>
                        <div class="activity-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }

    // ================= PASSWORD RESET (ADMIN ONLY) =================
    async openPasswordResetModal() {
        if (!this.isUserAdmin()) {
            this.showNotification('Admin access required', 'error');
            return;
        }

        // Fetch all users for the dropdown
        try {
            const response = await fetch('/api/admin/users', {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }

            const users = await response.json();
            
            // Populate user dropdown
            const userSelect = document.getElementById('reset-user-select');
            userSelect.innerHTML = '<option value="">Choose a user...</option>' +
                users.map(user => `
                    <option value="${user.id}">
                        ${user.username} (${user.email}) ${user.role === 'admin' ? '- Admin' : ''}
                    </option>
                `).join('');

            // Clear form
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-new-password').value = '';

            // Show modal
            document.getElementById('password-reset-modal').classList.add('active');
        } catch (error) {
            console.error('Error loading users:', error);
            this.showNotification('Failed to load users', 'error');
        }
    }

    closePasswordResetModal() {
        document.getElementById('password-reset-modal').classList.remove('active');
        document.getElementById('password-reset-form').reset();
    }

    async resetUserPassword(e) {
        e.preventDefault();

        if (!this.isUserAdmin()) {
            this.showNotification('Admin access required', 'error');
            return;
        }

        const userId = document.getElementById('reset-user-select').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;

        // Validation
        if (!userId) {
            this.showNotification('Please select a user', 'error');
            return;
        }

        if (newPassword.length < 6) {
            this.showNotification('Password must be at least 6 characters', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showNotification('Passwords do not match', 'error');
            return;
        }

        // Confirm action
        const userSelect = document.getElementById('reset-user-select');
        const selectedUsername = userSelect.options[userSelect.selectedIndex].text;
        
        if (!confirm(`Are you sure you want to reset password for ${selectedUsername}?`)) {
            return;
        }

        try {
            const response = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    userId: parseInt(userId),
                    newPassword: newPassword
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to reset password');
            }

            this.showNotification(`Password reset successfully for ${data.username}`, 'success');
            this.closePasswordResetModal();
        } catch (error) {
            console.error('Password reset error:', error);
            this.showNotification(error.message || 'Failed to reset password', 'error');
        }
    }

    // ================= EXPENSE MANAGEMENT =================
    
    async loadExpenseGroups() {
        try {
            const response = await fetch('/api/expenses/groups', {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (response.ok) {
                this.expenseGroups = data;
                this.renderExpenseGroups();
            } else {
                throw new Error(data.error || 'Failed to load expense groups');
            }
        } catch (error) {
            console.error('Load expense groups error:', error);
            this.showNotification(error.message, 'error');
        }
    }
    
    renderExpenseGroups() {
        const container = document.getElementById('expense-groups-list');
        if (!container) return;
        
        if (this.expenseGroups.length === 0) {
            container.innerHTML = '<p class="empty-state">No expense groups yet. Create one to start splitting expenses!</p>';
            return;
        }
        
        container.innerHTML = this.expenseGroups.map(group => `
            <div class="expense-group-card ${group.is_settled ? 'settled' : ''}" onclick="app.viewGroupDetails(${group.id})">
                <div class="expense-group-header">
                    <h3 class="expense-group-title">${this.escapeHtml(group.name)}</h3>
                    ${group.is_settled ? '<span class="expense-group-badge">✅ Settled</span>' : ''}
                </div>
                ${group.description ? `<p style="color: #7f8c8d; font-size: 0.9rem; margin: 10px 0;">${this.escapeHtml(group.description)}</p>` : ''}
                <div class="expense-group-stats">
                    <div class="expense-stat">
                        <div class="expense-stat-label">Total Amount</div>
                        <div class="expense-stat-value amount">₹${parseFloat(group.total_amount).toFixed(2)}</div>
                    </div>
                    <div class="expense-stat">
                        <div class="expense-stat-label">Expenses</div>
                        <div class="expense-stat-value">${group.expense_count}</div>
                    </div>
                    <div class="expense-stat">
                        <div class="expense-stat-label">Members</div>
                        <div class="expense-stat-value">${group.member_count}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async viewGroupDetails(groupId) {
        this.currentGroupId = groupId;
        this.switchView('expense-detail');
        await this.loadGroupDetails(groupId);
    }
    
    async loadGroupDetails(groupId) {
        try {
            // Add cache-busting and no-cache headers to ensure fresh data
            const fetchOptions = {
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            };
            
            const [detailsResponse, balanceResponse, settlementsResponse] = await Promise.all([
                fetch(`/api/expenses/groups/${groupId}?t=${Date.now()}`, fetchOptions),
                fetch(`/api/expenses/groups/${groupId}/balance?t=${Date.now()}`, fetchOptions),
                fetch(`/api/expenses/groups/${groupId}/settlements?t=${Date.now()}`, fetchOptions)
            ]);
            
            // Check for authentication errors
            if (detailsResponse.status === 401 || balanceResponse.status === 401 || settlementsResponse.status === 401) {
                this.showNotification('Session expired. Please login again.', 'error');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
                return;
            }
            
            const details = await detailsResponse.json();
            const balanceData = await balanceResponse.json();
            const settlements = await settlementsResponse.json();
            
            if (detailsResponse.ok && balanceResponse.ok) {
                this.currentGroupDetails = {
                    ...details,
                    balances: balanceData.balances,
                    settlements: balanceData.settlements,
                    settlementHistory: settlements
                };
                this.renderGroupDetails();
            } else {
                throw new Error(details.error || 'Failed to load group details');
            }
        } catch (error) {
            console.error('Load group details error:', error);
            this.showNotification(error.message, 'error');
        }
    }
    
    renderGroupDetails() {
        if (!this.currentGroupDetails) return;
        
        const { group, members, expenses, balances, settlements, settlementHistory } = this.currentGroupDetails;
        
        // Update title
        document.getElementById('group-detail-title').textContent = group.name;
        
        // Show/hide manage members button for admin only
        const manageMembersBtn = document.getElementById('manage-members-btn');
        if (manageMembersBtn) {
            manageMembersBtn.style.display = this.isUserAdmin() ? 'block' : 'none';
        }
        
        // Populate expense user filter
        this.populateExpenseUserFilter(members);
        
        // Render balance summary
        this.renderBalanceSummary(balances);
        
        // Render suggested settlements
        this.renderSuggestedSettlements(settlements);
        
        // Render expenses with current filter value
        const expenseUserFilter = document.getElementById('expense-user-filter');
        const filterValue = expenseUserFilter ? expenseUserFilter.value : 'all';
        this.renderGroupExpenses(expenses, filterValue);
        
        // Render settlement history
        this.renderSettlementHistory(settlementHistory);
    }
    
    populateExpenseUserFilter(members) {
        const filterSelect = document.getElementById('expense-user-filter');
        if (!filterSelect || !members) return;
        
        // Keep "All Expenses" option and add members
        filterSelect.innerHTML = '<option value="all">All Expenses</option>' +
            members.map(member =>
                `<option value="${member.user_id || member.id}">${this.escapeHtml(member.full_name || member.username)}</option>`
            ).join('');
    }
    
    renderBalanceSummary(balances) {
        const container = document.getElementById('balance-summary');
        if (!container || !balances) return;
        
        if (balances.length === 0) {
            container.innerHTML = '<p class="empty-state">No balance data</p>';
            return;
        }
        
        container.innerHTML = balances.map(balance => {
            // Calculate balance: what they paid minus what they should pay (their share)
            const totalPaid = parseFloat(balance.total_paid) || 0;
            const totalShare = parseFloat(balance.total_share) || 0;
            const balanceValue = totalPaid - totalShare;
            
            let cardClass = 'neutral';
            let statusText = '₹0.00';
            let balanceSign = '';
            
            if (balanceValue > 0.01) {
                // Positive balance: they paid more than their share, so they should GET money back
                cardClass = 'positive';
                balanceSign = '+';
                statusText = `${balanceSign}₹${balanceValue.toFixed(2)}`;
            } else if (balanceValue < -0.01) {
                // Negative balance: they paid less than their share, so they OWE money
                cardClass = 'negative';
                balanceSign = '-';
                statusText = `${balanceSign}₹${Math.abs(balanceValue).toFixed(2)}`;
            } else {
                // Balanced: they paid exactly their share
                statusText = '₹0.00';
            }
            
            const userInitial = (balance.full_name || balance.username).charAt(0).toUpperCase();
            const userPhoto = balance.photo
                ? `<img src="/uploads/${balance.photo}" alt="${balance.full_name}" class="balance-user-photo">`
                : `<div class="balance-user-photo" style="background: #95a5a6; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">${userInitial}</div>`;
            
            return `
                <div class="balance-card ${cardClass}">
                    <div class="balance-user">
                        ${userPhoto}
                        <div class="balance-user-name">${this.escapeHtml(balance.full_name || balance.username)}</div>
                    </div>
                    <div class="balance-amounts">
                        <span>Paid: ₹${totalPaid.toFixed(2)}</span>
                        <span>Share: ₹${totalShare.toFixed(2)}</span>
                    </div>
                    <div class="balance-total ${cardClass}">${statusText}</div>
                </div>
            `;
        }).join('');
    }
    
    renderSuggestedSettlements(settlements) {
        const container = document.getElementById('suggested-settlements');
        if (!container) return;
        
        if (!settlements || settlements.length === 0) {
            container.innerHTML = '<p class="empty-state">✅ All settled up! No payments needed.</p>';
            return;
        }
        
        const groupId = this.currentGroupId;
        
        // Validate groupId before rendering
        if (!groupId) {
            console.error('Cannot render settlements: groupId is missing');
            container.innerHTML = '<p class="empty-state error">Error: Group ID missing. Please refresh the page.</p>';
            return;
        }
        
        container.innerHTML = settlements.map(settlement => {
            // Validate settlement data
            if (!settlement.from_user_id || !settlement.to_user_id || !settlement.amount) {
                console.error('Invalid settlement data:', settlement);
                return '';
            }
            
            // Only show "Mark as Paid" button if current user is the receiver
            const isReceiver = this.currentUser && this.currentUser.id === settlement.to_user_id;
            const actionButton = isReceiver
                ? `<button class="btn btn-success btn-sm"
                          data-from-user-id="${settlement.from_user_id}"
                          data-amount="${settlement.amount}"
                          data-group-id="${groupId}"
                          onclick="app.markAsPaid(${settlement.from_user_id}, ${settlement.amount}, ${groupId})">
                       ✓ Mark as Paid
                   </button>`
                : '';
            
            return `
                <div class="settlement-card suggested">
                    <div class="settlement-icon">💸</div>
                    <div class="settlement-details">
                        <div class="settlement-text">
                            <strong>${this.escapeHtml(settlement.from_user_name)}</strong> should pay
                            <strong>${this.escapeHtml(settlement.to_user_name)}</strong>
                        </div>
                        <div class="settlement-amount">₹${parseFloat(settlement.amount).toFixed(2)}</div>
                    </div>
                    <div class="settlement-action">
                        ${actionButton}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    renderGroupExpenses(expenses, filterUserId = 'all') {
        const container = document.getElementById('group-expenses-list');
        if (!container) return;
        
        if (!expenses || expenses.length === 0) {
            container.innerHTML = '<p class="empty-state">No expenses yet. Add your first expense!</p>';
            return;
        }
        
        // Filter expenses based on selected user
        let filteredExpenses = expenses;
        if (filterUserId !== 'all') {
            const selectedUserId = parseInt(filterUserId);
            
            // Debug logging
            console.log('Filter Debug:', {
                filterUserId,
                selectedUserId,
                selectedUserIdType: typeof selectedUserId,
                currentUserId: this.currentUser.id,
                currentUserIdType: typeof this.currentUser.id,
                totalExpenses: expenses.length,
                expenses: expenses.map(e => ({
                    id: e.id,
                    description: e.description,
                    paid_by: e.paid_by,
                    paid_by_type: typeof e.paid_by,
                    splits: e.splits ? e.splits.map(s => ({
                        user_id: s.user_id,
                        user_id_type: typeof s.user_id,
                        username: s.username
                    })) : []
                }))
            });
            
            filteredExpenses = expenses.filter(expense => {
                // Check if the selected user paid for this expense
                const isPaidBySelectedUser = expense.paid_by === selectedUserId;
                
                // Check if current logged-in user is part of the splits
                const isCurrentUserInSplit = expense.splits && expense.splits.some(
                    split => split.user_id === this.currentUser.id
                );
                
                // Check if the selected user is the current logged-in user
                const isFilteringOwnExpenses = selectedUserId === this.currentUser.id;
                
                console.log(`Expense ${expense.id}:`, {
                    description: expense.description,
                    isPaidBySelectedUser,
                    isCurrentUserInSplit,
                    isFilteringOwnExpenses,
                    willShow: isFilteringOwnExpenses ? isPaidBySelectedUser : (isPaidBySelectedUser && isCurrentUserInSplit)
                });
                
                // Show expense if:
                // - User is filtering their own expenses: show all expenses they paid for
                // - User is filtering someone else's expenses: show only if they paid AND current user is in the split
                if (isFilteringOwnExpenses) {
                    return isPaidBySelectedUser;
                } else {
                    return isPaidBySelectedUser && isCurrentUserInSplit;
                }
            });
            
            console.log('Filtered expenses count:', filteredExpenses.length);
        }
        
        if (filteredExpenses.length === 0) {
            container.innerHTML = '<p class="empty-state">No expenses found for this filter.</p>';
            return;
        }
        
        container.innerHTML = filteredExpenses.map((expense, index) => {
            const splitsHtml = expense.splits && expense.splits.length > 0
                ? expense.splits.map(split => `
                    <div class="split-item">
                        <span class="split-person">${this.escapeHtml(split.full_name || split.username)}</span>
                        <span class="split-amount">₹${parseFloat(split.share_amount).toFixed(2)}</span>
                    </div>
                `).join('')
                : '<p class="empty-state" style="font-size: 0.9rem; margin: 10px 0;">No split information available</p>';
            
            return `
                <div class="expense-item-wrapper">
                    <div class="expense-item" onclick="app.toggleExpenseSplits(${index})">
                        <div class="expense-category-icon">💰</div>
                        <div class="expense-info">
                            <div class="expense-description">${this.escapeHtml(expense.description)}</div>
                            <div class="expense-meta">
                                ${new Date(expense.expense_date).toLocaleDateString()} •
                                Paid by ${this.escapeHtml(expense.paid_by_name || expense.paid_by_username)}
                                ${expense.splits && expense.splits.length > 0 ? ` • Split among ${expense.splits.length} ${expense.splits.length === 1 ? 'person' : 'people'}` : ''}
                            </div>
                        </div>
                        <div class="expense-amount-display">
                            <div class="expense-amount-value">₹${parseFloat(expense.amount).toFixed(2)}</div>
                            <div class="expense-expand-icon" id="expand-icon-${index}">▼</div>
                        </div>
                        <div class="expense-actions">
                            ${this.isUserAdmin() || expense.paid_by === this.currentUser.id ? `
                                <button class="btn btn-sm btn-delete" onclick="event.stopPropagation(); app.deleteExpense(${expense.id})">🗑️</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="expense-splits-detail" id="expense-splits-${index}" style="display: none;">
                        <div class="splits-header">💸 Split Details:</div>
                        <div class="splits-list">
                            ${splitsHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    toggleExpenseSplits(index) {
        const splitsDetail = document.getElementById(`expense-splits-${index}`);
        const expandIcon = document.getElementById(`expand-icon-${index}`);
        
        if (splitsDetail && expandIcon) {
            const isVisible = splitsDetail.style.display !== 'none';
            splitsDetail.style.display = isVisible ? 'none' : 'block';
            expandIcon.textContent = isVisible ? '▼' : '▲';
        }
    }
    
    renderSettlementHistory(settlements) {
        const container = document.getElementById('settlement-history');
        if (!container) return;
        
        if (!settlements || settlements.length === 0) {
            container.innerHTML = '<p class="empty-state">No settlements recorded yet</p>';
            return;
        }
        
        container.innerHTML = settlements.map(settlement => `
            <div class="settlement-card">
                <div class="settlement-icon">💳</div>
                <div class="settlement-details">
                    <div class="settlement-text">
                        <strong>${this.escapeHtml(settlement.from_name || settlement.from_username)}</strong> paid
                        <strong>${this.escapeHtml(settlement.to_name || settlement.to_username)}</strong>
                    </div>
                    <div class="settlement-amount">₹${parseFloat(settlement.amount).toFixed(2)}</div>
                    <div class="settlement-meta">
                        ${new Date(settlement.settlement_date).toLocaleString()}
                        ${settlement.notes ? ` • ${this.escapeHtml(settlement.notes)}` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    openExpenseGroupModal() {
        // Check if user is admin
        if (!this.isUserAdmin()) {
            this.showNotification('Only admins can create expense groups', 'error');
            return;
        }
        
        const modal = document.getElementById('expense-group-modal');
        document.getElementById('group-name').value = '';
        document.getElementById('group-description').value = '';
        
        // Populate members checkboxes
        const container = document.getElementById('group-members-checkboxes');
        container.innerHTML = this.users.map(user => `
            <div class="checkbox-item">
                <input type="checkbox" id="member-${user.id}" value="${user.id}"
                       ${user.id === this.currentUser.id ? 'checked' : ''}>
                <label for="member-${user.id}">${this.escapeHtml(user.full_name || user.username)}</label>
            </div>
        `).join('');
        
        modal.classList.add('active');
    }
    
    closeExpenseGroupModal() {
        document.getElementById('expense-group-modal').classList.remove('active');
    }
    
    async saveExpenseGroup(e) {
        e.preventDefault();
        
        const name = document.getElementById('group-name').value;
        const description = document.getElementById('group-description').value;
        
        // Get selected members
        const memberIds = Array.from(document.querySelectorAll('#group-members-checkboxes input:checked'))
            .map(cb => parseInt(cb.value));
        
        if (memberIds.length === 0) {
            this.showNotification('Please select at least one member', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/expenses/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, description, memberIds })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Expense group created successfully!', 'success');
                this.closeExpenseGroupModal();
                await this.loadExpenseGroups();
            } else {
                throw new Error(data.error || 'Failed to create group');
            }
        } catch (error) {
            console.error('Create group error:', error);
            this.showNotification(error.message, 'error');
        }
    }
    
    openAddExpenseModal() {
        if (!this.currentGroupId) return;
        
        const modal = document.getElementById('add-expense-modal');
        document.getElementById('expense-description').value = '';
        document.getElementById('expense-amount').value = '';
        document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('expense-split-type').value = 'equal';
        
        // Show equal split section by default
        document.getElementById('equal-split-section').style.display = 'block';
        document.getElementById('custom-split-section').style.display = 'none';
        
        // Populate split checkboxes with group members
        const container = document.getElementById('expense-split-checkboxes');
        if (this.currentGroupDetails && this.currentGroupDetails.members) {
            container.innerHTML = this.currentGroupDetails.members.map(member => `
                <div class="checkbox-item">
                    <input type="checkbox" id="split-${member.id}" value="${member.id}" checked>
                    <label for="split-${member.id}">${this.escapeHtml(member.full_name || member.username)}</label>
                </div>
            `).join('');
            
            // Add Select All / Deselect All buttons
            const buttonsHtml = `
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="app.selectAllMembers(true)">✓ Select All</button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="app.selectAllMembers(false)">✗ Deselect All</button>
                </div>
            `;
            container.insertAdjacentHTML('afterend', buttonsHtml);
        }
        
        // Setup split type change handler
        const splitTypeSelect = document.getElementById('expense-split-type');
        splitTypeSelect.onchange = () => this.handleSplitTypeChange();
        
        // Setup amount change handler for custom splits
        const amountInput = document.getElementById('expense-amount');
        amountInput.oninput = () => {
            if (splitTypeSelect.value === 'custom') {
                this.updateCustomSplits();
            }
        };
        
        modal.classList.add('active');
    }
    
    handleSplitTypeChange() {
        const splitType = document.getElementById('expense-split-type').value;
        const equalSection = document.getElementById('equal-split-section');
        const customSection = document.getElementById('custom-split-section');
        
        if (splitType === 'equal') {
            equalSection.style.display = 'block';
            customSection.style.display = 'none';
        } else {
            equalSection.style.display = 'none';
            customSection.style.display = 'block';
            this.updateCustomSplits();
        }
    }
    
    updateCustomSplits() {
        const container = document.getElementById('expense-custom-splits');
        const totalAmount = parseFloat(document.getElementById('expense-amount').value) || 0;
        
        if (!this.currentGroupDetails || !this.currentGroupDetails.members) return;
        
        // Remove old event listeners using bound handlers
        container.removeEventListener('change', this._boundHandleCustomSplitChange);
        container.removeEventListener('input', this._boundHandleCustomSplitInput);
        
        // Replace container content
        container.innerHTML = this.currentGroupDetails.members.map(member => `
            <div class="custom-split-item">
                <div class="custom-split-checkbox">
                    <input type="checkbox"
                           id="custom-split-check-${member.id}"
                           value="${member.id}"
                           data-member-id="${member.id}">
                    <label for="custom-split-check-${member.id}">
                        ${this.escapeHtml(member.full_name || member.username)}
                    </label>
                </div>
                <input type="number"
                       id="custom-split-${member.id}"
                       value="0"
                       min="0"
                       step="0.01"
                       placeholder="0.00"
                       disabled
                       data-member-id="${member.id}">
            </div>
        `).join('');
        
        // Add event listeners using bound handlers (prevents memory leaks)
        container.addEventListener('change', this._boundHandleCustomSplitChange);
        container.addEventListener('input', this._boundHandleCustomSplitInput);
        
        this.validateCustomSplits();
    }
    
    toggleCustomSplitInput(memberId) {
        const checkbox = document.getElementById(`custom-split-check-${memberId}`);
        const input = document.getElementById(`custom-split-${memberId}`);
        
        if (checkbox && input) {
            if (checkbox.checked) {
                input.disabled = false;
                input.focus();
            } else {
                input.disabled = true;
                input.value = '0';
            }
            
            this.validateCustomSplits();
        }
    }
    
    validateCustomSplitsDebounced() {
        // Clear existing timer
        clearTimeout(this.validateDebounceTimer);
        
        // Set new timer - validate after 150ms of no input
        this.validateDebounceTimer = setTimeout(() => {
            this.validateCustomSplits();
        }, 150);
    }
    
    validateCustomSplits() {
        // Cache DOM elements for better performance
        if (!this._cachedElements.amountInput) {
            this._cachedElements.amountInput = document.getElementById('expense-amount');
            this._cachedElements.displayDiv = document.getElementById('split-total-display');
        }
        
        const totalAmount = parseFloat(this._cachedElements.amountInput?.value) || 0;
        const displayDiv = this._cachedElements.displayDiv;
        
        if (!displayDiv) return false;
        
        if (totalAmount === 0) {
            displayDiv.innerHTML = '<span style="color: #7f8c8d;">Enter expense amount first</span>';
            displayDiv.className = '';
            return false;
        }
        
        // Batch DOM reads - only get enabled number inputs
        const inputs = Array.from(document.querySelectorAll('input[type="number"][id^="custom-split-"]:not([disabled])'));
        
        if (inputs.length === 0) {
            displayDiv.innerHTML = '<span style="color: #e74c3c;">Select at least one member</span>';
            displayDiv.className = 'invalid';
            return false;
        }
        
        // Calculate split total
        const splitTotal = inputs.reduce((sum, input) => sum + (parseFloat(input.value) || 0), 0);
        const difference = Math.abs(totalAmount - splitTotal);
        const isValid = difference < 0.01; // Allow 1 paisa difference for rounding
        
        // Batch DOM writes using requestAnimationFrame for smooth UI
        requestAnimationFrame(() => {
            displayDiv.className = isValid ? 'valid' : 'invalid';
            displayDiv.innerHTML = `
                <div style="font-size: 0.9rem;">
                    <div>Total Amount: <strong>₹${totalAmount.toFixed(2)}</strong></div>
                    <div>Split Total: <strong>₹${splitTotal.toFixed(2)}</strong></div>
                    <div style="margin-top: 5px; font-weight: bold;">
                        ${isValid ? '✅ Splits match!' : `❌ Difference: ₹${difference.toFixed(2)}`}
                    </div>
                </div>
            `;
        });
        
        return isValid;
    }
    
    closeAddExpenseModal() {
        document.getElementById('add-expense-modal').classList.remove('active');
        
        // Clear cached elements when modal closes
        this._cachedElements = {};
        
        // Remove event listeners to prevent memory leaks
        const container = document.getElementById('expense-custom-splits');
        if (container) {
            container.removeEventListener('change', this._boundHandleCustomSplitChange);
            container.removeEventListener('input', this._boundHandleCustomSplitInput);
        }
    }
    
    async saveExpense(e) {
        e.preventDefault();
        
        const splitType = document.getElementById('expense-split-type').value;
        const description = document.getElementById('expense-description').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);
        
        // Validate inputs
        if (!description || description.trim().length === 0) {
            this.showNotification('Please enter a description', 'error');
            return;
        }
        
        if (isNaN(amount) || amount <= 0) {
            this.showNotification('Please enter a valid amount greater than 0', 'error');
            return;
        }
        
        // Validate split type specific requirements
        if (splitType === 'equal') {
            const splitWith = Array.from(document.querySelectorAll('#expense-split-checkboxes input:checked'));
            if (splitWith.length === 0) {
                this.showNotification('Please select at least one member to split with', 'error');
                return;
            }
        } else if (splitType === 'custom') {
            if (!this.validateCustomSplits()) {
                this.showNotification('Split amounts must equal the total expense amount', 'error');
                return;
            }
            
            const enabledInputs = document.querySelectorAll('input[type="number"][id^="custom-split-"]:not([disabled])');
            if (enabledInputs.length === 0) {
                this.showNotification('Please select at least one member for custom split', 'error');
                return;
            }
        }
        
        const formData = new FormData();
        formData.append('groupId', this.currentGroupId);
        formData.append('description', description.trim());
        formData.append('amount', amount);
        formData.append('expenseDate', document.getElementById('expense-date').value);
        formData.append('splitType', splitType);
        
        if (splitType === 'equal') {
            // Get selected split members for equal split
            const splitWith = Array.from(document.querySelectorAll('#expense-split-checkboxes input:checked'))
                .map(cb => parseInt(cb.value));
            formData.append('splitWith', JSON.stringify(splitWith));
        } else {
            // Get custom split amounts - only from number inputs that are enabled
            const customSplits = {};
            const inputs = document.querySelectorAll('input[type="number"][id^="custom-split-"]:not([disabled])');
            inputs.forEach(input => {
                const userId = parseInt(input.id.replace('custom-split-', ''));
                const splitAmount = parseFloat(input.value) || 0;
                if (splitAmount > 0) {
                    customSplits[userId] = splitAmount;
                }
            });
            
            if (Object.keys(customSplits).length === 0) {
                this.showNotification('Please enter split amounts for at least one member', 'error');
                return;
            }
            
            formData.append('customSplits', JSON.stringify(customSplits));
        }
        
        try {
            const response = await fetch('/api/expenses', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Expense added successfully! 💰', 'success');
                this.closeAddExpenseModal();
                await this.loadGroupDetails(this.currentGroupId);
            } else {
                // Show user-friendly error message
                const errorMsg = data.error || 'Failed to add expense';
                this.showNotification(errorMsg, 'error');
                console.error('Server error:', data.details || errorMsg);
            }
        } catch (error) {
            console.error('Add expense error:', error);
            this.showNotification('Network error. Please check your connection and try again.', 'error');
        }
    }
    
    async markAsPaid(fromUserId, amount, groupId) {
        // Validate inputs
        if (!fromUserId) {
            this.showNotification('Invalid user ID. Please refresh the page.', 'error');
            console.error('markAsPaid called with invalid fromUserId:', fromUserId);
            return;
        }
        
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            this.showNotification('Invalid amount. Please refresh the page.', 'error');
            console.error('markAsPaid called with invalid amount:', amount);
            return;
        }
        
        // Use provided groupId or fall back to currentGroupId
        const targetGroupId = groupId || this.currentGroupId;
        
        if (!targetGroupId) {
            this.showNotification('Group ID is missing. Please refresh the page.', 'error');
            console.error('markAsPaid called with no groupId. groupId:', groupId, 'currentGroupId:', this.currentGroupId);
            return;
        }
        
        // Confirm action
        const fromUser = this.currentGroupDetails?.members?.find(m => m.id === fromUserId);
        const fromUserName = fromUser ? (fromUser.full_name || fromUser.username) : 'Unknown';
        
        if (!confirm(`Confirm that you received ₹${parseFloat(amount).toFixed(2)} from ${fromUserName}?`)) {
            return;
        }
        
        // Prepare payload
        const payload = {
            groupId: parseInt(targetGroupId),
            fromUserId: parseInt(fromUserId),
            amount: parseFloat(amount),
            notes: 'Payment confirmed'
        };
        
        console.log('Sending settlement request:', payload);
        
        try {
            const response = await fetch('/api/expenses/settlements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Payment marked as received! 💳', 'success');
                await this.loadGroupDetails(targetGroupId);
            } else {
                console.error('Settlement failed:', data);
                throw new Error(data.error || 'Failed to record settlement');
            }
        } catch (error) {
            console.error('Mark as paid error:', error);
            this.showNotification(error.message || 'Failed to record payment. Please try again.', 'error');
        }
    }
    
    async deleteExpense(expenseId) {
        if (!confirm('Are you sure you want to delete this expense?')) return;
        
        try {
            const response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Expense deleted successfully', 'success');
                await this.loadGroupDetails(this.currentGroupId);
            } else {
                throw new Error(data.error || 'Failed to delete expense');
            }
        } catch (error) {
            console.error('Delete expense error:', error);
            this.showNotification(error.message, 'error');
        }
    }
    
    async settleGroup() {
        if (!confirm('Mark this group as settled? This will indicate all expenses are settled.')) return;
        
        try {
            const response = await fetch(`/api/expenses/groups/${this.currentGroupId}/settle`, {
                method: 'PUT',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification('Group marked as settled!', 'success');
                this.switchView('expenses');
            } else {
                throw new Error(data.error || 'Failed to settle group');
            }
        } catch (error) {
            console.error('Settle group error:', error);
            this.showNotification(error.message, 'error');
        }
    }
    
    selectAllMembers(selectAll) {
        const checkboxes = document.querySelectorAll('#expense-split-checkboxes input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAll;
        });
    }
    
    async openManageMembersModal() {
        if (!this.currentGroupId || !this.currentGroupDetails) return;
        
        const modal = document.getElementById('manage-members-modal');
        const currentMembersList = document.getElementById('current-members-list');
        const availableMembersList = document.getElementById('available-members-list');
        
        // Get current group members
        const currentMemberIds = this.currentGroupDetails.members.map(m => m.id);
        
        // Display current members
        currentMembersList.innerHTML = this.currentGroupDetails.members.map(member => `
            <div class="checkbox-item" style="padding: 10px; background: #f0f0f0; border-radius: 5px; margin-bottom: 5px;">
                <span style="font-weight: 500;">${this.escapeHtml(member.full_name || member.username)}</span>
            </div>
        `).join('');
        
        // Get all users and filter out current members
        const availableUsers = this.users.filter(user => !currentMemberIds.includes(user.id));
        
        if (availableUsers.length === 0) {
            availableMembersList.innerHTML = '<p style="color: #666; font-style: italic;">All registered users are already members of this group</p>';
        } else {
            availableMembersList.innerHTML = availableUsers.map(user => `
                <div class="checkbox-item">
                    <input type="checkbox" id="add-member-${user.id}" value="${user.id}">
                    <label for="add-member-${user.id}">${this.escapeHtml(user.full_name || user.username)}</label>
                </div>
            `).join('');
        }
        
        modal.classList.add('active');
    }
    
    closeManageMembersModal() {
        document.getElementById('manage-members-modal').classList.remove('active');
    }
    
    async saveGroupMembers() {
        const selectedUserIds = Array.from(document.querySelectorAll('#available-members-list input:checked'))
            .map(cb => parseInt(cb.value));
        
        if (selectedUserIds.length === 0) {
            this.showNotification('No new members selected', 'info');
            this.closeManageMembersModal();
            return;
        }
        
        try {
            const response = await fetch(`/api/expenses/groups/${this.currentGroupId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ memberIds: selectedUserIds })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showNotification(`Added ${selectedUserIds.length} member(s) to the group!`, 'success');
                this.closeManageMembersModal();
                await this.loadGroupDetails(this.currentGroupId);
            } else {
                throw new Error(data.error || 'Failed to add members');
            }
        } catch (error) {
            console.error('Add members error:', error);
            this.showNotification(error.message, 'error');
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ================= INIT =================
let app;
document.addEventListener("DOMContentLoaded", () => {
    app = new TaskManager();
});

