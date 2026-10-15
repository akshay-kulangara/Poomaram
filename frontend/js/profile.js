// Profile Page JavaScript
class ProfileManager {
    constructor() {
        this.currentUser = null;
        this.expenses = [];
        this.init();
    }

    async init() {
        const isAuthenticated = await this.checkAuth();
        if (isAuthenticated && this.currentUser) {
            this.updateCurrentDate();
            await this.loadProfileData();
        } else {
            console.log('User not authenticated, waiting for redirect...');
        }
    }

    async checkAuth() {
        try {
            const response = await fetch('/api/auth/status', {
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.authenticated) {
                this.currentUser = data.user;
                console.log('User authenticated:', this.currentUser.username);
                return true;
            }
            
            console.log('User not authenticated, redirecting to login...');
            window.location.href = 'login.html';
            return false;
        } catch (error) {
            console.error('Auth check failed:', error);
            window.location.href = 'login.html';
            return false;
        }
    }

    updateCurrentDate() {
        const dateElement = document.getElementById('current-date');
        if (dateElement) {
            const options = { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' };
            dateElement.textContent = new Date().toLocaleDateString('en-US', options);
        }
    }

    async loadProfileData() {
        try {
            // Load all expenses from all groups the user is part of
            const groupsResponse = await fetch('/api/expenses/groups', {
                credentials: 'include'
            });

            if (!groupsResponse.ok) {
                throw new Error('Failed to load expense groups');
            }

            const groups = await groupsResponse.json();
            console.log('Loaded groups:', groups);
            
            // Collect all expenses from all groups
            const allExpenses = [];
            for (const group of groups) {
                const groupDetailsResponse = await fetch(`/api/expenses/groups/${group.id}`, {
                    credentials: 'include'
                });

                if (groupDetailsResponse.ok) {
                    const groupDetails = await groupDetailsResponse.json();
                    console.log(`Loaded expenses for group ${group.id}:`, groupDetails.expenses);
                    if (groupDetails.expenses && groupDetails.expenses.length > 0) {
                        allExpenses.push(...groupDetails.expenses);
                    }
                }
            }

            console.log('Total expenses loaded:', allExpenses.length);
            this.expenses = allExpenses;
            this.renderProfile();
        } catch (error) {
            console.error('Error loading profile data:', error);
            this.showNotification('Failed to load profile data', 'error');
        }
    }

    renderProfile() {
        // Update profile header
        const profileName = document.getElementById('profile-name');
        const profileUsername = document.getElementById('profile-username');
        const profileAvatar = document.getElementById('profile-avatar');

        if (profileName) {
            profileName.textContent = this.currentUser.full_name || this.currentUser.username;
        }

        if (profileUsername) {
            profileUsername.textContent = `@${this.currentUser.username}`;
        }

        if (profileAvatar) {
            if (this.currentUser.photo) {
                profileAvatar.innerHTML = `<img src="/uploads/${this.currentUser.photo}" alt="${this.currentUser.full_name || this.currentUser.username}">`;
            } else {
                const initial = (this.currentUser.full_name || this.currentUser.username)[0].toUpperCase();
                profileAvatar.innerHTML = `<div class="profile-avatar-placeholder">${initial}</div>`;
            }
        }

        // Separate expenses into paid and share
        const paidExpenses = this.expenses.filter(expense => 
            expense.paid_by === this.currentUser.id
        );

        const shareExpenses = this.expenses.filter(expense => 
            expense.splits && expense.splits.some(split => split.user_id === this.currentUser.id)
        );

        // Calculate totals
        const totalPaid = paidExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
        const totalShare = shareExpenses.reduce((sum, expense) => {
            const userSplit = expense.splits.find(split => split.user_id === this.currentUser.id);
            return sum + (userSplit ? parseFloat(userSplit.share_amount) : 0);
        }, 0);
        const netBalance = totalPaid - totalShare;

        // Update stats
        document.getElementById('total-paid').textContent = `₹${totalPaid.toFixed(2)}`;
        document.getElementById('total-share').textContent = `₹${totalShare.toFixed(2)}`;
        
        const netBalanceElement = document.getElementById('net-balance');
        netBalanceElement.textContent = `${netBalance >= 0 ? '' : '-'}₹${Math.abs(netBalance).toFixed(2)}`;
        netBalanceElement.style.color = netBalance >= 0 ? '#2ecc71' : '#e74c3c';

        // Render tables
        this.renderPaidExpenses(paidExpenses, totalPaid);
        this.renderShareExpenses(shareExpenses, totalShare);
    }

    renderPaidExpenses(expenses, total) {
        const tbody = document.getElementById('paid-expenses-body');
        
        if (!expenses || expenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: #999;">No expenses paid yet</td></tr>';
            return;
        }

        const rows = expenses.map(expense => {
            const date = new Date(expense.expense_date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

            return `
                <tr>
                    <td>
                        <div class="expense-description">${this.escapeHtml(expense.description)}</div>
                        <div class="expense-date">${date} • ${expense.splits ? expense.splits.length : 0} ${expense.splits && expense.splits.length === 1 ? 'person' : 'people'}</div>
                    </td>
                    <td class="expense-amount">₹${parseFloat(expense.amount).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const totalRow = `
            <tr class="total-row">
                <td><strong>Total Paid</strong></td>
                <td class="expense-amount"><strong>₹${total.toFixed(2)}</strong></td>
            </tr>
        `;

        tbody.innerHTML = rows + totalRow;
    }

    renderShareExpenses(expenses, total) {
        const tbody = document.getElementById('share-expenses-body');
        
        if (!expenses || expenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; padding: 2rem; color: #999;">No shared expenses yet</td></tr>';
            return;
        }

        const rows = expenses.map(expense => {
            const date = new Date(expense.expense_date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });

            const userSplit = expense.splits.find(split => split.user_id === this.currentUser.id);
            const shareAmount = userSplit ? parseFloat(userSplit.share_amount) : 0;

            return `
                <tr>
                    <td>
                        <div class="expense-description">${this.escapeHtml(expense.description)}</div>
                        <div class="expense-date">${date} • Paid by ${this.escapeHtml(expense.paid_by_name || expense.paid_by_username)}</div>
                    </td>
                    <td class="expense-share">₹${shareAmount.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const totalRow = `
            <tr class="total-row">
                <td><strong>Total Share</strong></td>
                <td class="expense-share"><strong>₹${total.toFixed(2)}</strong></td>
            </tr>
        `;

        tbody.innerHTML = rows + totalRow;
    }

    escapeHtml(text) {
        const map = {
            '&': '&',
            '<': '<',
            '>': '>',
            '"': '"',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize profile manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.profileManager = new ProfileManager();
});

// Made with Bob
