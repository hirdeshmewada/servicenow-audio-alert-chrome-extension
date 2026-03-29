/**
 * Dashboard Manager Component
 * Handles dashboard functionality and real-time updates
 */

export class DashboardManager {
    constructor() {
        this.refreshBtn = null;
        this.queueElements = {};
        this.ticketListElement = null;
        this.ticketCountElement = null;
        this.init();
    }

    init() {
        this.setupElements();
        this.setupEventListeners();
    }

    setupElements() {
        this.refreshBtn = document.getElementById('refreshQueues');
        this.queueElements = {
            queueACount: document.getElementById('queueACount'),
            queueBCount: document.getElementById('queueBCount'),
            totalCount: document.getElementById('totalCount')
        };
        this.ticketListElement = document.getElementById('recentTicketsList');
        this.ticketCountElement = document.getElementById('recentTicketCount');
    }

    setupEventListeners() {
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => {
                this.dispatchRefreshQueues();
            });
        }
    }

    updateTicketCounts(queueACount = 0, queueBCount = 0, totalCount = 0) {
        Object.entries(this.queueElements).forEach(([id, count]) => {
            if (this.queueElements[id]) {
                this.queueElements[id].textContent = count;
            }
        });

        // Dispatch update event
        this.dispatchTicketUpdate({
            type: 'counts',
            data: { queueACount, queueBCount, totalCount }
        });
    }

    updateRecentTickets(tickets = []) {
        if (this.ticketCountElement) {
            this.ticketCountElement.textContent = tickets.length;
        }
        
        if (!this.ticketListElement) return;
        
        if (tickets.length === 0) {
            this.ticketListElement.innerHTML = '<div class="empty-state">No recent tickets</div>';
            return;
        }

        this.ticketListElement.innerHTML = tickets.slice(0, 5).map(ticket => `
            <div class="ticket-item">
                <strong>${ticket.number}</strong> - ${ticket.description || 'ServiceNow ticket'}
            </div>
        `).join('');

        // Dispatch update event
        this.dispatchTicketUpdate({
            type: 'tickets',
            data: tickets
        });
    }

    dispatchRefreshQueues() {
        const event = new CustomEvent('refreshQueues', {
            detail: { timestamp: Date.now() }
        });
        document.dispatchEvent(event);
    }

    dispatchTicketUpdate(updateData) {
        const event = new CustomEvent('ticketUpdate', {
            detail: updateData
        });
        document.dispatchEvent(event);
    }

    showEmptyState(message = 'No recent tickets') {
        if (this.ticketListElement) {
            this.ticketListElement.innerHTML = `<div class="empty-state">${message}</div>`;
        }
        if (this.ticketCountElement) {
            this.ticketCountElement.textContent = '0';
        }
    }
}
