/**
 * Navigation Manager Component
 * Handles all navigation-related functionality
 */

export class NavigationManager {
    constructor() {
        this.currentPage = 'dashboard';
        this.navItems = null;
        this.init();
    }

    init() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.switchPage(page);
            });
        });
    }

    switchPage(pageName) {
        // Update navigation
        this.navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageName) {
                item.classList.add('active');
            }
        });

        // Update content
        const pages = document.querySelectorAll('.page-content');
        pages.forEach(page => {
            page.classList.remove('active');
        });
        
        const activePage = document.getElementById(pageName);
        if (activePage) {
            activePage.classList.add('active');
        }

        this.currentPage = pageName;
        
        // Dispatch custom event for page change
        this.dispatchPageChange(pageName);
    }

    dispatchPageChange(pageName) {
        const event = new CustomEvent('pageChange', {
            detail: { page: pageName }
        });
        document.dispatchEvent(event);
    }

    getCurrentPage() {
        return this.currentPage;
    }

    setActiveNavItem(pageName) {
        this.navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageName) {
                item.classList.add('active');
            }
        });
    }
}
