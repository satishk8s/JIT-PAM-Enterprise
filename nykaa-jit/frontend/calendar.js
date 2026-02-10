class CalendarPopup {
    constructor(inputElement) {
        this.inputElement = inputElement;
        this.date = new Date();
        this.year = this.date.getFullYear();
        this.month = this.date.getMonth();
        this.clickedDay = null;
        this.selectedDayElement = null;
        this.createCalendar();
        this.attachEvents();
    }

    createCalendar() {
        this.popup = document.createElement('div');
        this.popup.className = 'calendar-container';
        this.popup.innerHTML = `
            <header class="calendar-header">
                <p class="calendar-current-date"></p>
                <div class="calendar-navigation">
                    <span class="calendar-nav-btn">‹</span>
                    <span class="calendar-nav-btn">›</span>
                </div>
            </header>
            <div class="calendar-body">
                <ul class="calendar-weekdays">
                    <li>Sun</li><li>Mon</li><li>Tue</li><li>Wed</li><li>Thu</li><li>Fri</li><li>Sat</li>
                </ul>
                <ul class="calendar-dates"></ul>
            </div>
            <div class="calendar-time-picker">
                <input type="number" class="hour" min="1" max="12" value="12"> :
                <input type="number" class="minute" min="0" max="59" value="00">
                <select class="ampm"><option>AM</option><option>PM</option></select>
            </div>
            <div class="calendar-actions">
                <button class="cancel">Cancel</button>
                <button class="ok">OK</button>
            </div>
        `;
        document.body.appendChild(this.popup);
        this.prevBtn = this.popup.querySelector('.calendar-nav-btn:first-child');
        this.nextBtn = this.popup.querySelector('.calendar-nav-btn:last-child');
    }

    attachEvents() {
        this.inputElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.show();
        });
        
        this.prevBtn.addEventListener('click', () => this.changeMonth(-1));
        this.nextBtn.addEventListener('click', () => this.changeMonth(1));
        this.popup.querySelector('.cancel').addEventListener('click', () => this.hide());
        this.popup.querySelector('.ok').addEventListener('click', () => this.selectDate());
        
        document.addEventListener('click', (e) => {
            if (!this.popup.contains(e.target) && e.target !== this.inputElement) {
                this.hide();
            }
        });
    }

    show() {
        this.render();
        const rect = this.inputElement.getBoundingClientRect();
        this.popup.style.top = `${rect.bottom + 5}px`;
        this.popup.style.left = `${rect.left}px`;
        this.popup.classList.add('show');
    }

    hide() {
        this.popup.classList.remove('show');
    }

    changeMonth(delta) {
        this.month += delta;
        if (this.month < 0 || this.month > 11) {
            this.date = new Date(this.year, this.month, new Date().getDate());
            this.year = this.date.getFullYear();
            this.month = this.date.getMonth();
        }
        this.clickedDay = null;
        this.selectedDayElement = null;
        this.render();
    }

    render() {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
        
        let dayone = new Date(this.year, this.month, 1).getDay();
        let lastdate = new Date(this.year, this.month + 1, 0).getDate();
        let dayend = new Date(this.year, this.month, lastdate).getDay();
        let monthlastdate = new Date(this.year, this.month, 0).getDate();
        
        let lit = '';
        
        for (let i = dayone; i > 0; i--) {
            lit += `<li class="inactive">${monthlastdate - i + 1}</li>`;
        }
        
        for (let i = 1; i <= lastdate; i++) {
            let isToday = (i === this.date.getDate() && this.month === new Date().getMonth() && this.year === new Date().getFullYear()) ? 'active' : '';
            let highlightClass = (this.clickedDay === i) ? 'highlight' : '';
            lit += `<li class="${isToday} ${highlightClass}" data-day="${i}">${i}</li>`;
        }
        
        for (let i = dayend; i < 6; i++) {
            lit += `<li class="inactive">${i - dayend + 1}</li>`;
        }
        
        this.popup.querySelector('.calendar-current-date').innerText = `${months[this.month]} ${this.year}`;
        this.popup.querySelector('.calendar-dates').innerHTML = lit;
        
        this.addClickListenersToDays();
    }

    addClickListenersToDays() {
        const allDays = this.popup.querySelectorAll('.calendar-dates li:not(.inactive)');
        allDays.forEach(li => {
            li.addEventListener('click', () => {
                if (this.selectedDayElement) {
                    this.selectedDayElement.classList.remove('highlight');
                }
                li.classList.add('highlight');
                this.selectedDayElement = li;
                this.clickedDay = parseInt(li.getAttribute('data-day'));
            });
        });
    }

    selectDate() {
        if (!this.clickedDay) {
            alert('Please select a date');
            return;
        }
        
        const hour = parseInt(this.popup.querySelector('.hour').value) || 12;
        const minute = parseInt(this.popup.querySelector('.minute').value) || 0;
        const ampm = this.popup.querySelector('.ampm').value;
        
        const formatted = `${this.year}-${String(this.month + 1).padStart(2, '0')}-${String(this.clickedDay).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
        
        this.inputElement.value = formatted;
        this.hide();
    }
}
