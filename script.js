const authSessionKey = 'zackconnect-auth-session';
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const defaultApiBaseUrl = isLocalhost
    ? 'http://localhost:3000/api'
    : 'https://my-backend-six-dun.vercel.app/api';
const apiBaseUrl = window.ZACKCONNECT_API_URL || defaultApiBaseUrl;
const authReturnPages = new Set([
    'index.html',
    'software.html',
    'car-import.html',
    'data-bundels.html',
    'bajaj.html',
    'enquire.html',
    'admin.html'
]);

async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const session = getAuthSession();
    if (session?.token) headers.set('Authorization', `Bearer ${session.token}`);
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');

    let response;
    try {
        response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
    } catch (error) {
        console.error(`Unable to connect to the API at ${apiBaseUrl}.`, error);
        throw new Error('Unable to reach the Zackconnect API. Make sure the backend and database are running.');
    }
    const responseText = await response.text();
    let body = {};
    if (responseText) {
        try {
            body = JSON.parse(responseText);
        } catch (error) {
            console.error('The API returned an invalid JSON response.', error);
            throw new Error('The server returned an invalid response.');
        }
    }
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
}

function getAuthSession() {
    try {
        const serialized = localStorage.getItem(authSessionKey) || sessionStorage.getItem(authSessionKey);
        if (!serialized) return null;
        const session = JSON.parse(serialized);
        if (session && typeof session.email === 'string' && typeof session.token === 'string') {
            return session;
        }
        localStorage.removeItem(authSessionKey);
        sessionStorage.removeItem(authSessionKey);
        return null;
    } catch (error) {
        console.error('Unable to read the sign-in session.', error);
        return null;
    }
}

function getAuthDestination() {
    const requested = new URLSearchParams(window.location.search).get('return');
    if (!requested) return 'index.html';
    try {
        const destination = new URL(requested, window.location.href);
        const page = destination.pathname.split('/').pop();
        if (destination.origin !== window.location.origin || !authReturnPages.has(page)) {
            return 'index.html';
        }
        return `${page}${destination.search}${destination.hash}`;
    } catch (error) {
        console.error('Unable to read the requested destination after sign-in.', error);
        return 'index.html';
    }
}

function setAuthSession(user, remember, token) {
    const session = JSON.stringify({
        email: user.email,
        name: user.name,
        role: user.role,
        token
    });
    const destinationStorage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;
    otherStorage.removeItem(authSessionKey);
    destinationStorage.setItem(authSessionKey, session);
}

const currentAuthPage = window.location.pathname.split('/').pop();
const currentAuthSession = getAuthSession();
if (currentAuthPage === 'admin.html' && !currentAuthSession) {
    const returnPath = `admin.html${window.location.search}${window.location.hash}`;
    window.location.replace(`signup.html?return=${encodeURIComponent(returnPath)}`);
} else if ((currentAuthPage === 'signup.html' || currentAuthPage === 'login.html') && currentAuthSession) {
    window.location.replace(getAuthDestination());
}

const navigationLinks = document.querySelector('.nav-links');
if (navigationLinks && currentAuthPage !== 'signup.html' && currentAuthPage !== 'login.html') {
    const currentPage = currentAuthPage || 'index.html';
    const returnPath = `${currentPage}${window.location.search}${window.location.hash}`;
    const authLink = navigationLinks.querySelector('.nav-auth-link');
    if (currentAuthSession) {
        if (authLink) {
            authLink.href = '#logout';
            authLink.textContent = 'Log out';
            authLink.setAttribute('aria-label', 'Log out');
            authLink.addEventListener('click', (event) => {
                event.preventDefault();
                localStorage.removeItem(authSessionKey);
                sessionStorage.removeItem(authSessionKey);
                window.location.reload();
            });
        }
    } else if (authLink) {
        authLink.href = `login.html?return=${encodeURIComponent(returnPath)}`;
        authLink.textContent = 'Log in';
        authLink.setAttribute('aria-label', 'Log in');
    }
}

if (currentAuthPage === 'signup.html' || currentAuthPage === 'login.html') {
    const authSwitchLink = document.querySelector('.auth-footer .auth-link');
    if (authSwitchLink) {
        const switchPage = currentAuthPage === 'signup.html' ? 'login.html' : 'signup.html';
        authSwitchLink.href = `${switchPage}?return=${encodeURIComponent(getAuthDestination())}`;
    }
}

function redirectAfterAuth() {
    window.location.replace(getAuthDestination());
}

const signupForm = document.getElementById('signupForm');
if (signupForm) {
    const status = document.getElementById('signupStatus');
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = new FormData(signupForm);
        const name = `${String(values.get('firstname') || '').trim()} ${String(values.get('lastname') || '').trim()}`.trim();
        const email = String(values.get('email') || '').trim().toLowerCase();
        const password = String(values.get('password') || '');
        const confirmPassword = String(values.get('confirm-password') || '');
        if (password.length < 8) {
            setStatus(status, 'Your password must be at least 8 characters long.', true);
            return;
        }
        if (password !== confirmPassword) {
            setStatus(status, 'The passwords do not match.', true);
            return;
        }

        try {
            const { user, token } = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    email,
                    phone: String(values.get('phone') || '').trim(),
                    password
                })
            });
            setAuthSession(user, Boolean(values.get('remember')), token);
            redirectAfterAuth();
        } catch (error) {
            console.error('Unable to create account.', error);
            setStatus(status, error.message || 'Unable to create your account. Please try again.', true);
        }
    });
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    const status = document.getElementById('loginStatus');
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = new FormData(loginForm);
        const email = String(values.get('email') || '').trim().toLowerCase();
        const password = String(values.get('password') || '');
        try {
            const { user, token } = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            setAuthSession(user, Boolean(values.get('remember')), token);
            redirectAfterAuth();
        } catch (error) {
            console.error('Unable to sign in.', error);
            setStatus(status, error.message || 'Unable to sign in. Please try again.', true);
        }
    });
}

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Mobile menu toggle
function createMobileMenu() {
    const navbar = document.querySelector('.nav-container');
    const navLinks = document.querySelector('.nav-links');

    if (!navbar || !navLinks) {
        return;
    }

    // Create hamburger menu button
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger';
    hamburger.type = 'button';
    hamburger.setAttribute('aria-label', 'Open navigation');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    navbar.insertBefore(hamburger, navLinks);

    // Toggle mobile menu
    hamburger.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('active');
        hamburger.classList.toggle('active', isOpen);
        hamburger.setAttribute('aria-expanded', String(isOpen));
        hamburger.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });
}

// Initialize mobile menu
createMobileMenu();

const primaryButton = document.querySelector('.btn-primary');
if (primaryButton && !primaryButton.getAttribute('href')) {
    primaryButton.addEventListener('click', (event) => {
        const enquireSection = document.querySelector('#enquire');
        if (enquireSection) {
            event.preventDefault();
            enquireSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert('Enquiry form coming soon!');
        }
    });
}

const secondaryButton = document.querySelector('.btn-secondary');
if (secondaryButton && !secondaryButton.getAttribute('href')) {
    secondaryButton.addEventListener('click', (event) => {
        const carImportSection = document.querySelector('#car-import');
        if (carImportSection) {
            event.preventDefault();
            carImportSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert('Vehicle catalog coming soon!');
        }
    });
}

// Add scroll effect to navbar
const navbar = document.querySelector('.navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
        } else {
            navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        }
    });
}

// Animate elements on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.service-card, .testimonial-card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
}

const defaultCars = [
    ['Toyota Camry 2024', '$25,000', 'New', 'Automatic', '2.5L'],
    ['Honda Accord 2023', '$22,500', 'New', 'Automatic', '2.0L'],
    ['BMW X5 2022', '$45,000', 'Used', 'Automatic', '3.0L'],
    ['Mercedes C-Class 2023', '$42,000', 'New', 'Automatic', '2.0L'],
    ['Audi Q7 2022', '$48,000', 'Used', 'Automatic', '3.0L'],
    ['Lexus RX 2024', '$52,000', 'New', 'Automatic', '3.5L']
].map(([name, price, condition, transmission, engine], index) => ({
    id: `seed-car-${index + 1}`,
    name,
    price,
    condition,
    transmission,
    engine,
    mileage: '',
    color: '',
    image: '',
    description: ''
}));

const defaultTricycles = [
    ['Bajaj RE Passenger Tricycle', 'GHC 42,000', 'New', '2025', 'Brand new 3-seater, ready to register.'],
    ['Bajaj Maxima Cargo', 'GHC 25,000', 'Used', '2021', 'Well maintained cargo tricycle, strong engine.'],
    ['Bajaj RE Passenger', 'GHC 40,000', 'New', '2024', 'Brand new passenger tricycle, excellent condition.'],
    ['Bajaj Compact', 'GHC 22,000', 'Used', '2022', 'Compact size, perfect for city transport.']
].map(([name, price, condition, year, description], index) => ({
    id: `seed-tricycle-${index + 1}`,
    name,
    price,
    condition,
    year,
    description,
    image: '',
    photoMediaId: '',
    videoMediaIds: []
}));

function loadCatalog(key, defaults) {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) {
            localStorage.setItem(key, JSON.stringify(defaults));
            return defaults;
        }
        const catalog = JSON.parse(stored);
        if (!Array.isArray(catalog)) {
            throw new Error(`Stored catalog "${key}" is not a list.`);
        }
        return catalog;
    } catch (error) {
        console.error(`Unable to load catalog "${key}".`, error);
        throw error;
    }
}

function saveCatalog(key, catalog) {
    try {
        localStorage.setItem(key, JSON.stringify(catalog));
    } catch (error) {
        console.error(`Unable to save catalog "${key}".`, error);
        throw error;
    }
}

function formatBundlePrice(price) {
    const amount = Number(price);
    return `GH¢ ${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
}

let bundleCatalog = [];
let carCatalog = loadCatalog('zackconnect-cars', defaultCars);
let tricycleCatalog = loadCatalog('zackconnect-tricycles', defaultTricycles);
let selectedNetwork = 'MTN';
const objectUrls = [];

let mediaDatabasePromise;
function getMediaDatabase() {
    if (!('indexedDB' in window)) {
        return Promise.reject(new Error('This browser does not support persistent media uploads.'));
    }
    if (!mediaDatabasePromise) {
        mediaDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open('zackconnect-media', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('media')) {
                    request.result.createObjectStore('media', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Unable to open media storage.'));
        });
    }
    return mediaDatabasePromise;
}

async function saveMediaFile(file, kind) {
    const maxBytes = kind === 'video' ? 100 * 1024 * 1024 : 15 * 1024 * 1024;
    const isValidType = kind === 'pdf'
        ? file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        : file.type.startsWith(`${kind}/`);
    if (!isValidType) {
        throw new Error(kind === 'pdf' ? 'Choose a valid PDF file.' : `Choose a valid ${kind} file.`);
    }
    if (file.size > maxBytes) {
        throw new Error(`${file.name} is too large. Maximum ${kind} size is ${kind === 'video' ? '100 MB' : '15 MB'}.`);
    }
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const db = await getMediaDatabase();
    await new Promise((resolve, reject) => {
        const transaction = db.transaction('media', 'readwrite');
        transaction.objectStore('media').put({ id, blob: file, name: file.name, type: file.type });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error(`Unable to save ${file.name}.`));
        transaction.onabort = () => reject(transaction.error || new Error(`Unable to save ${file.name}.`));
    });
    return id;
}

async function getMediaFile(id) {
    if (!id) return null;
    const db = await getMediaDatabase();
    return new Promise((resolve, reject) => {
        const request = db.transaction('media', 'readonly').objectStore('media').get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Unable to read uploaded media.'));
    });
}

async function deleteMediaFile(id) {
    if (!id) return;
    const db = await getMediaDatabase();
    await new Promise((resolve, reject) => {
        const transaction = db.transaction('media', 'readwrite');
        transaction.objectStore('media').delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Unable to remove uploaded media.'));
    });
}

function createMediaUrl(record) {
    if (!record?.blob) return '';
    const url = URL.createObjectURL(record.blob);
    objectUrls.push(url);
    return url;
}

window.addEventListener('beforeunload', () => objectUrls.forEach(URL.revokeObjectURL));

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function renderBundles() {
    const grid = document.querySelector('.bundle-grid');
    if (!grid) return;

    grid.replaceChildren();
    const shownBundles = bundleCatalog.filter(bundle => bundle.network === selectedNetwork);
    if (!shownBundles.length) {
        grid.append(createElement('p', 'empty-catalog-message', `No ${selectedNetwork} bundles are available yet.`));
        return;
    }

    shownBundles.forEach((bundle) => {
        const networkClass = bundle.network.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const card = createElement('button', `bundle-card network-${networkClass}`);
        card.type = 'button';
        card.dataset.bundleId = bundle.id;

        const header = createElement('span', 'bundle-header');
        const logoText = bundle.network === 'TELECEL' ? 'telecel' :
            bundle.network === 'AIRTELTIGO' ? 'at' : bundle.network;
        header.append(createElement('span', 'bundle-logo', logoText));
        card.append(header);
        card.append(createElement('span', 'bundle-size', bundle.size));

        const meta = createElement('span', 'bundle-meta');
        meta.append(createElement('span', 'bundle-price', formatBundlePrice(bundle.price)));
        meta.append(createElement('span', 'bundle-expiry', bundle.validity || 'No-Expiry'));
        card.append(meta);
        grid.append(card);
    });
}

async function refreshBundleCatalog() {
    try {
        const result = await apiRequest('/catalog/bundles');
        if (!Array.isArray(result.items)) throw new Error('The server returned an invalid data bundle catalog.');
        bundleCatalog = result.items;
        renderBundles();
        window.dispatchEvent(new CustomEvent('zackconnect:bundles-updated'));
        return true;
    } catch (error) {
        console.error('Unable to load the data bundle catalog.', error);
        bundleCatalog = [];
        renderBundles();
        const grid = document.querySelector('.bundle-grid');
        if (grid) {
            grid.replaceChildren(createElement('p', 'empty-catalog-message', 'Unable to load bundles. Please try again later.'));
        }
        const status = document.getElementById('bundleAdminStatus');
        if (status) setStatus(status, error.message || 'Unable to load bundles from the server.', true);
        window.dispatchEvent(new CustomEvent('zackconnect:bundles-updated'));
        return false;
    }
}

async function renderCars(condition = 'All') {
    const grid = document.querySelector('.car-grid');
    if (!grid) return;

    grid.replaceChildren();
    const shownCars = carCatalog.filter(car => condition === 'All' || car.condition === condition);
    if (!shownCars.length) {
        grid.append(createElement('p', 'empty-catalog-message', 'No cars are available in this category yet.'));
        return;
    }

    for (const car of shownCars) {
        const card = createElement('article', 'car-card');
        card.dataset.carId = car.id;
        card.dataset.condition = car.condition;

        const image = createElement('div', 'car-image-placeholder');
        let photoUrl = car.image || '';
        if (car.photoMediaId) {
            const media = await getMediaFile(car.photoMediaId);
            photoUrl = createMediaUrl(media) || photoUrl;
        }
        if (photoUrl) {
            const img = document.createElement('img');
            img.src = photoUrl;
            img.alt = car.name;
            image.replaceChildren(img);
        } else {
            image.textContent = 'CAR';
        }
        card.append(image);

        for (const videoId of car.videoMediaIds || []) {
            const media = await getMediaFile(videoId);
            const videoUrl = createMediaUrl(media);
            if (videoUrl) {
                const video = document.createElement('video');
                video.src = videoUrl;
                video.controls = true;
                video.preload = 'metadata';
                video.setAttribute('aria-label', `${car.name} video`);
                card.append(video);
            }
        }

        const info = createElement('div', 'car-info');
        info.append(createElement('h3', 'car-name', car.name));
        info.append(createElement('p', 'car-price', car.price));
        const specs = [car.condition, car.transmission, car.engine, car.mileage, car.color, car.description]
            .filter(Boolean)
            .join(' • ');
        info.append(createElement('p', 'car-details', specs));
        card.append(info);
        const requestButton = createElement('button', 'car-request-button', 'Import this car');
        requestButton.type = 'button';
        requestButton.dataset.carName = car.name;
        card.append(requestButton);
        grid.append(card);
    }
}

async function renderTricycles(condition = 'All') {
    const grid = document.querySelector('.tricycle-grid');
    if (!grid) return;

    grid.replaceChildren();
    const shownTricycles = tricycleCatalog.filter(item => condition === 'All' || item.condition === condition);
    if (!shownTricycles.length) {
        grid.append(createElement('p', 'empty-catalog-message', 'No tricycles are available in this category yet.'));
        return;
    }

    for (const tricycle of shownTricycles) {
        const card = createElement('article', 'tricycle-card');
        const image = createElement('div', 'tricycle-image-placeholder');
        let photoUrl = tricycle.image || '';
        if (tricycle.photoMediaId) {
            const media = await getMediaFile(tricycle.photoMediaId);
            photoUrl = createMediaUrl(media) || photoUrl;
        }
        if (photoUrl) {
            const img = document.createElement('img');
            img.src = photoUrl;
            img.alt = tricycle.name;
            image.replaceChildren(img);
        } else {
            image.textContent = 'BAJAJ';
        }
        card.append(image);

        for (const videoId of tricycle.videoMediaIds || []) {
            const media = await getMediaFile(videoId);
            const videoUrl = createMediaUrl(media);
            if (videoUrl) {
                const video = document.createElement('video');
                video.src = videoUrl;
                video.controls = true;
                video.preload = 'metadata';
                video.setAttribute('aria-label', `${tricycle.name} video`);
                card.append(video);
            }
        }

        const info = createElement('div', 'tricycle-info');
        const header = createElement('div', 'tricycle-header');
        header.append(createElement('h3', 'tricycle-name', tricycle.name));
        header.append(createElement('span', `tricycle-badge ${tricycle.condition.toLowerCase()}`, tricycle.condition.toUpperCase()));
        info.append(header);
        info.append(createElement('p', 'tricycle-year', tricycle.year));
        info.append(createElement('p', 'tricycle-description', tricycle.description));

        const footer = createElement('div', 'tricycle-footer');
        footer.append(createElement('p', 'tricycle-price', tricycle.price));
        const actions = createElement('div', 'tricycle-card-actions');
        const enquireLink = createElement('a', 'tricycle-enquire', 'Enquire');
        enquireLink.href = 'enquire.html';
        actions.append(enquireLink);
        const buyButton = createElement('button', 'tricycle-buy-button', 'Buy');
        buyButton.type = 'button';
        buyButton.dataset.tricycleId = tricycle.id;
        actions.append(buyButton);
        footer.append(actions);
        info.append(footer);
        card.append(info);
        grid.append(card);
    }
}

renderBundles();
renderCars();
renderTricycles();

const startTricyclePurchaseButton = document.getElementById('startTricyclePurchase');
const tricyclePurchaseForm = document.getElementById('tricyclePurchaseForm');
if (startTricyclePurchaseButton && tricyclePurchaseForm) {
    const tricycleSelection = document.getElementById('tricyclePurchaseSelection');
    const status = document.getElementById('tricyclePurchaseStatus');

    function openTricyclePurchaseForm(tricycleId = '') {
        tricycleSelection.replaceChildren(new Option('Select a tricycle', ''));
        for (const tricycle of tricycleCatalog) {
            tricycleSelection.add(new Option(`${tricycle.name} — ${tricycle.price}`, tricycle.id));
        }
        tricycleSelection.value = tricycleId;
        tricyclePurchaseForm.classList.remove('hidden');
        startTricyclePurchaseButton.setAttribute('aria-expanded', 'true');
        tricyclePurchaseForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    startTricyclePurchaseButton.addEventListener('click', () => openTricyclePurchaseForm());
    document.querySelector('.tricycle-grid')?.addEventListener('click', (event) => {
        const button = event.target.closest('.tricycle-buy-button');
        if (button) openTricyclePurchaseForm(button.dataset.tricycleId);
    });

    tricyclePurchaseForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const submitButton = tricyclePurchaseForm.querySelector('button[type="submit"]');
        const values = new FormData(tricyclePurchaseForm);
        const selectedTricycle = tricycleCatalog.find(item => item.id === values.get('tricycleId'));
        if (!selectedTricycle) {
            setStatus(status, 'Select a tricycle to continue.', true);
            return;
        }

        submitButton.disabled = true;
        setStatus(status, '');
        try {
            const enquiries = loadCatalog('zackconnect-enquiries', []);
            const details = String(values.get('details') || '').trim();
            enquiries.unshift({
                id: `enquiry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: String(values.get('name') || '').trim(),
                phone: String(values.get('phone') || '').trim(),
                email: String(values.get('email') || '').trim(),
                service: 'Tricycle Purchase',
                message: [
                    `Tricycle: ${selectedTricycle.name}`,
                    `Price: ${selectedTricycle.price}`,
                    `Condition: ${selectedTricycle.condition}`,
                    `Year: ${selectedTricycle.year}`,
                    `Delivery location: ${String(values.get('deliveryLocation') || '').trim()}`,
                    details ? `Additional details: ${details}` : ''
                ].filter(Boolean).join('\n'),
                status: 'Pending',
                submittedAt: new Date().toISOString()
            });
            saveCatalog('zackconnect-enquiries', enquiries);
            tricyclePurchaseForm.reset();
            setStatus(status, 'Your purchase request has been sent. Our team will contact you about availability and payment.');
        } catch (error) {
            console.error('Unable to submit tricycle purchase request.', error);
            setStatus(status, error.message || 'Unable to send your purchase request. Please try again.', true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

document.querySelectorAll('.network-button').forEach((button) => {
    button.addEventListener('click', () => {
        const network = button.querySelector('span:last-child')?.textContent.trim();
        if (!network) return;
        selectedNetwork = network;
        document.querySelectorAll('.network-button').forEach(item => item.classList.toggle('active', item === button));
        renderBundles();
    });
});

const bundleModal = document.getElementById('bundleModal');
if (bundleModal) {
    const modalTitle = document.getElementById('bundleModalTitle');
    const modalTotal = document.getElementById('bundleModalTotal');
    const payButton = document.getElementById('bundlePayButton');
    const orderStatus = document.getElementById('bundleOrderStatus');
    const recipientInput = document.getElementById('bundle-recipient');
    const emailInput = document.getElementById('bundle-email');
    const closeButton = document.querySelector('.bundle-modal-close');
    const bundleGrid = document.querySelector('.bundle-grid');
    let selectedBundle = null;

    bundleGrid?.addEventListener('click', (event) => {
        const card = event.target.closest('.bundle-card');
        if (!card) return;
        const bundle = bundleCatalog.find(item => item.id === card.dataset.bundleId);
        if (!bundle) return;
        selectedBundle = bundle;
        const price = formatBundlePrice(bundle.price);

        if (modalTitle) modalTitle.textContent = `${bundle.size} - ${bundle.network}`;
        if (modalTotal) modalTotal.textContent = price;
        setStatus(orderStatus, '');
        if (payButton) {
            payButton.textContent = `Create order - ${price}`;
            payButton.classList.remove('network-mtn', 'network-telecel', 'network-airteltigo', 'network-afa-reg');
            const networkClass = bundle.network.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            payButton.classList.add(`network-${networkClass}`);
        }
        bundleModal.classList.remove('hidden');
    });

    payButton?.addEventListener('click', async () => {
        if (!selectedBundle || !recipientInput || !emailInput) return;
        if (!recipientInput.reportValidity() || !emailInput.reportValidity()) return;

        payButton.disabled = true;
        setStatus(orderStatus, '');
        try {
            const { order } = await apiRequest('/bundle-orders', {
                method: 'POST',
                body: JSON.stringify({
                    bundleId: selectedBundle.id,
                    recipientPhone: recipientInput.value.trim(),
                    email: emailInput.value.trim()
                })
            });
            setStatus(orderStatus, `Order ${order.order_code} recorded as Pending payment. No payment was taken.`);
        } catch (error) {
            console.error('Unable to record bundle order.', error);
            setStatus(orderStatus, error.message || 'Unable to record this bundle order.', true);
        } finally {
            payButton.disabled = false;
        }
    });

    closeButton?.addEventListener('click', () => bundleModal.classList.add('hidden'));
    bundleModal.addEventListener('click', (event) => {
        if (event.target === bundleModal) bundleModal.classList.add('hidden');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') bundleModal.classList.add('hidden');
    });
}

document.querySelectorAll('.filter-button').forEach((button) => {
    button.addEventListener('click', () => {
        const condition = button.textContent.trim();
        document.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('active', item === button));
        renderCars(condition);
        renderTricycles(condition);
    });
});

function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', isError);
}

function createMessageDeliveryTicks(className) {
    const ticks = createElement('span', className, '✓✓');
    ticks.setAttribute('aria-label', 'Delivered');
    ticks.title = 'Delivered';
    return ticks;
}

const bundleAdminForm = document.getElementById('bundleAdminForm');
if (bundleAdminForm) {
    const bundleAdminId = document.getElementById('bundleAdminId');
    const bundleAdminNetwork = document.getElementById('bundleAdminNetwork');
    const bundleAdminSize = document.getElementById('bundleAdminSize');
    const bundleAdminPrice = document.getElementById('bundleAdminPrice');
    const bundleAdminValidity = document.getElementById('bundleAdminValidity');
    const bundleAdminList = document.getElementById('bundleAdminList');
    const bundleAdminStatus = document.getElementById('bundleAdminStatus');
    const bundleAdminCancel = document.getElementById('bundleAdminCancel');

    function renderBundleAdminList() {
        bundleAdminList.replaceChildren();
        bundleCatalog.forEach((bundle) => {
            const row = createElement('div', 'admin-catalog-row');
            const details = createElement('div', 'admin-catalog-item-copy');
            details.append(createElement('strong', '', `${bundle.network} · ${bundle.size}`));
            details.append(createElement('span', '', `${formatBundlePrice(bundle.price)} · ${bundle.validity || 'No-Expiry'}`));
            row.append(details);

            const actions = createElement('div', 'admin-catalog-item-actions');
            const edit = createElement('button', 'admin-small-button', 'Edit');
            edit.type = 'button';
            edit.dataset.action = 'edit';
            edit.dataset.id = bundle.id;
            const remove = createElement('button', 'admin-small-button danger', 'Delete');
            remove.type = 'button';
            remove.dataset.action = 'delete';
            remove.dataset.id = bundle.id;
            actions.append(edit, remove);
            row.append(actions);
            bundleAdminList.append(row);
        });
    }

    function resetBundleForm() {
        bundleAdminForm.reset();
        bundleAdminId.value = '';
        bundleAdminValidity.value = 'No-Expiry';
        bundleAdminCancel.classList.add('hidden');
    }

    bundleAdminForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = bundleAdminForm.querySelector('button[type="submit"]');
        const size = bundleAdminSize.value.trim().toUpperCase();
        const price = Number(bundleAdminPrice.value);
        if (!size || !Number.isFinite(price) || price <= 0) {
            setStatus(bundleAdminStatus, 'Enter a bundle size and a price greater than zero.', true);
            return;
        }

        const duplicate = bundleCatalog.find(item =>
            item.id !== bundleAdminId.value &&
            item.network === bundleAdminNetwork.value &&
            item.size === size
        );
        if (duplicate) {
            setStatus(bundleAdminStatus, 'That network already has a bundle with this size.', true);
            return;
        }

        const id = bundleAdminId.value || `bundle-${crypto.randomUUID()}`;
        const bundle = {
            id,
            network: bundleAdminNetwork.value,
            size,
            price,
            validity: bundleAdminValidity.value.trim() || 'No-Expiry'
        };
        submitButton.disabled = true;
        setStatus(bundleAdminStatus, '');
        try {
            await apiRequest(
                bundleAdminId.value ? `/catalog/bundles/${encodeURIComponent(id)}` : '/catalog/bundles',
                {
                    method: bundleAdminId.value ? 'PUT' : 'POST',
                    body: JSON.stringify({ item: bundle })
                }
            );
            const refreshed = await refreshBundleCatalog();
            resetBundleForm();
            setStatus(
                bundleAdminStatus,
                refreshed ? 'Bundle saved and storefront updated.' : 'Bundle saved, but the catalog could not be refreshed.',
                !refreshed
            );
        } catch (error) {
            console.error('Unable to save data bundle.', error);
            setStatus(bundleAdminStatus, error.message || 'Unable to save the bundle.', true);
        } finally {
            submitButton.disabled = false;
        }
    });

    bundleAdminList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const bundle = bundleCatalog.find(item => item.id === button.dataset.id);
        if (!bundle) return;

        if (button.dataset.action === 'edit') {
            bundleAdminId.value = bundle.id;
            bundleAdminNetwork.value = bundle.network;
            bundleAdminSize.value = bundle.size;
            bundleAdminPrice.value = bundle.price;
            bundleAdminValidity.value = bundle.validity || 'No-Expiry';
            bundleAdminCancel.classList.remove('hidden');
            bundleAdminForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        button.disabled = true;
        setStatus(bundleAdminStatus, '');
        try {
            await apiRequest(`/catalog/bundles/${encodeURIComponent(bundle.id)}`, { method: 'DELETE' });
            const refreshed = await refreshBundleCatalog();
            setStatus(
                bundleAdminStatus,
                refreshed
                    ? `${bundle.network} ${bundle.size} removed.`
                    : 'Bundle removed, but the catalog could not be refreshed.',
                !refreshed
            );
        } catch (error) {
            console.error('Unable to delete data bundle.', error);
            setStatus(bundleAdminStatus, error.message || 'Unable to delete the bundle.', true);
        } finally {
            button.disabled = false;
        }
    });

    bundleAdminCancel.addEventListener('click', resetBundleForm);
    window.addEventListener('zackconnect:bundles-updated', renderBundleAdminList);
    refreshBundleCatalog();
}

const carAdminForm = document.getElementById('carAdminForm');
if (carAdminForm) {
    const carFields = {
        id: document.getElementById('carAdminId'),
        name: document.getElementById('carAdminName'),
        price: document.getElementById('carAdminPrice'),
        condition: document.getElementById('carAdminCondition'),
        transmission: document.getElementById('carAdminTransmission'),
        engine: document.getElementById('carAdminEngine'),
        mileage: document.getElementById('carAdminMileage'),
        color: document.getElementById('carAdminColor'),
        image: document.getElementById('carAdminImage'),
        description: document.getElementById('carAdminDescription')
    };
    const carAdminList = document.getElementById('carAdminList');
    const carAdminStatus = document.getElementById('carAdminStatus');
    const carAdminCancel = document.getElementById('carAdminCancel');
    const carPhotoFile = document.getElementById('carAdminPhotoFile');
    const carVideoFiles = document.getElementById('carAdminVideoFiles');

    function renderCarAdminList() {
        carAdminList.replaceChildren();
        carCatalog.forEach((car) => {
            const row = createElement('div', 'admin-catalog-row');
            const details = createElement('div', 'admin-catalog-item-copy');
            details.append(createElement('strong', '', car.name));
            const mediaSummary = [
                car.photoMediaId || car.image ? 'Photo' : '',
                car.videoMediaIds?.length ? `${car.videoMediaIds.length} video(s)` : ''
            ].filter(Boolean).join(' · ');
            details.append(createElement('span', '', `${car.price} · ${car.condition} · ${car.transmission} · ${car.engine}${mediaSummary ? ` · ${mediaSummary}` : ''}`));
            row.append(details);

            const actions = createElement('div', 'admin-catalog-item-actions');
            const edit = createElement('button', 'admin-small-button', 'Edit');
            edit.type = 'button';
            edit.dataset.action = 'edit';
            edit.dataset.id = car.id;
            const remove = createElement('button', 'admin-small-button danger', 'Delete');
            remove.type = 'button';
            remove.dataset.action = 'delete';
            remove.dataset.id = car.id;
            actions.append(edit, remove);
            row.append(actions);
            carAdminList.append(row);
        });
    }

    function resetCarForm() {
        carAdminForm.reset();
        carFields.id.value = '';
        carAdminCancel.classList.add('hidden');
    }

    carAdminForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const car = Object.fromEntries(
            Object.entries(carFields)
                .filter(([key]) => key !== 'id')
                .map(([key, input]) => [key, input.value.trim()])
        );
        if (car.image) {
            let imageUrl;
            try {
                imageUrl = new URL(car.image);
            } catch {
                setStatus(carAdminStatus, 'Enter a valid image URL or leave it blank.', true);
                return;
            }
            if (!['http:', 'https:'].includes(imageUrl.protocol)) {
                setStatus(carAdminStatus, 'Image URL must use HTTP or HTTPS.', true);
                return;
            }
        }

        const existingCar = carCatalog.find(item => item.id === carFields.id.value);
        car.id = carFields.id.value || `car-${Date.now()}`;
        car.photoMediaId = existingCar?.photoMediaId || '';
        car.videoMediaIds = existingCar?.videoMediaIds || [];
        try {
            if (carPhotoFile.files[0]) {
                car.photoMediaId = await saveMediaFile(carPhotoFile.files[0], 'image');
            }
            if (carVideoFiles.files.length) {
                car.videoMediaIds = [];
                for (const file of carVideoFiles.files) {
                    car.videoMediaIds.push(await saveMediaFile(file, 'video'));
                }
            }
            const existingIndex = carCatalog.findIndex(item => item.id === car.id);
            const nextCatalog = [...carCatalog];
            if (existingIndex >= 0) nextCatalog[existingIndex] = car;
            else nextCatalog.push(car);
            saveCatalog('zackconnect-cars', nextCatalog);
            if (existingCar?.photoMediaId && car.photoMediaId !== existingCar.photoMediaId) {
                await deleteMediaFile(existingCar.photoMediaId);
            }
            if (existingCar && existingCar.videoMediaIds !== car.videoMediaIds) {
                for (const mediaId of existingCar.videoMediaIds || []) await deleteMediaFile(mediaId);
            }
            carCatalog = nextCatalog;
            renderCarAdminList();
            renderCars();
            resetCarForm();
            setStatus(carAdminStatus, 'Car saved with media and Car Import page updated.');
        } catch (error) {
            console.error('Unable to save car listing.', error);
            setStatus(carAdminStatus, error.message || 'Unable to save the car listing.', true);
        }
    });

    carAdminList.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const car = carCatalog.find(item => item.id === button.dataset.id);
        if (!car) return;

        if (button.dataset.action === 'edit') {
            Object.entries(carFields).forEach(([key, input]) => {
                input.value = car[key] || '';
            });
            carAdminCancel.classList.remove('hidden');
            carAdminForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        (async () => {
            try {
                saveCatalog('zackconnect-cars', carCatalog.filter(item => item.id !== car.id));
                carCatalog = carCatalog.filter(item => item.id !== car.id);
                await deleteMediaFile(car.photoMediaId);
                for (const mediaId of car.videoMediaIds || []) await deleteMediaFile(mediaId);
                renderCarAdminList();
                renderCars();
                setStatus(carAdminStatus, `${car.name} removed.`);
            } catch (error) {
                console.error('Unable to delete car listing.', error);
                setStatus(carAdminStatus, error.message || 'Unable to delete the car listing.', true);
            }
        })();
    });

    carAdminCancel.addEventListener('click', resetCarForm);
    window.addEventListener('storage', (event) => {
        if (event.key !== 'zackconnect-cars') return;
        carCatalog = loadCatalog('zackconnect-cars', defaultCars);
        renderCarAdminList();
        renderCars();
    });
    renderCarAdminList();
}

const tricycleAdminForm = document.getElementById('tricycleAdminForm');
if (tricycleAdminForm) {
    const fields = {
        id: document.getElementById('tricycleAdminId'),
        name: document.getElementById('tricycleAdminName'),
        price: document.getElementById('tricycleAdminPrice'),
        condition: document.getElementById('tricycleAdminCondition'),
        year: document.getElementById('tricycleAdminYear'),
        description: document.getElementById('tricycleAdminDescription'),
        image: document.getElementById('tricycleAdminImage')
    };
    const photoFile = document.getElementById('tricycleAdminPhotoFile');
    const videoFiles = document.getElementById('tricycleAdminVideoFiles');
    const list = document.getElementById('tricycleAdminList');
    const status = document.getElementById('tricycleAdminStatus');
    const cancel = document.getElementById('tricycleAdminCancel');

    function renderTricycleAdminList() {
        list.replaceChildren();
        tricycleCatalog.forEach((tricycle) => {
            const row = createElement('div', 'admin-catalog-row');
            const details = createElement('div', 'admin-catalog-item-copy');
            details.append(createElement('strong', '', tricycle.name));
            const mediaSummary = [
                tricycle.photoMediaId || tricycle.image ? 'Photo' : '',
                tricycle.videoMediaIds?.length ? `${tricycle.videoMediaIds.length} video(s)` : ''
            ].filter(Boolean).join(' · ');
            details.append(createElement('span', '', `${tricycle.price} · ${tricycle.condition} · ${tricycle.year}${mediaSummary ? ` · ${mediaSummary}` : ''}`));
            row.append(details);
            const actions = createElement('div', 'admin-catalog-item-actions');
            const edit = createElement('button', 'admin-small-button', 'Edit');
            edit.type = 'button';
            edit.dataset.action = 'edit';
            edit.dataset.id = tricycle.id;
            const remove = createElement('button', 'admin-small-button danger', 'Delete');
            remove.type = 'button';
            remove.dataset.action = 'delete';
            remove.dataset.id = tricycle.id;
            actions.append(edit, remove);
            row.append(actions);
            list.append(row);
        });
    }

    function resetTricycleForm() {
        tricycleAdminForm.reset();
        fields.id.value = '';
        cancel.classList.add('hidden');
    }

    tricycleAdminForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const tricycle = Object.fromEntries(
            Object.entries(fields)
                .filter(([key]) => key !== 'id')
                .map(([key, input]) => [key, input.value.trim()])
        );
        if (tricycle.image) {
            let imageUrl;
            try {
                imageUrl = new URL(tricycle.image);
            } catch {
                setStatus(status, 'Enter a valid photo URL or leave it blank.', true);
                return;
            }
            if (!['http:', 'https:'].includes(imageUrl.protocol)) {
                setStatus(status, 'Photo URL must use HTTP or HTTPS.', true);
                return;
            }
        }

        const existing = tricycleCatalog.find(item => item.id === fields.id.value);
        tricycle.id = fields.id.value || `tricycle-${Date.now()}`;
        tricycle.photoMediaId = existing?.photoMediaId || '';
        tricycle.videoMediaIds = existing?.videoMediaIds || [];
        try {
            if (photoFile.files[0]) tricycle.photoMediaId = await saveMediaFile(photoFile.files[0], 'image');
            if (videoFiles.files.length) {
                tricycle.videoMediaIds = [];
                for (const file of videoFiles.files) {
                    tricycle.videoMediaIds.push(await saveMediaFile(file, 'video'));
                }
            }
            const index = tricycleCatalog.findIndex(item => item.id === tricycle.id);
            const nextCatalog = [...tricycleCatalog];
            if (index >= 0) nextCatalog[index] = tricycle;
            else nextCatalog.push(tricycle);
            saveCatalog('zackconnect-tricycles', nextCatalog);
            if (existing?.photoMediaId && tricycle.photoMediaId !== existing.photoMediaId) {
                await deleteMediaFile(existing.photoMediaId);
            }
            if (existing && existing.videoMediaIds !== tricycle.videoMediaIds) {
                for (const mediaId of existing.videoMediaIds || []) await deleteMediaFile(mediaId);
            }
            tricycleCatalog = nextCatalog;
            renderTricycleAdminList();
            renderTricycles();
            resetTricycleForm();
            setStatus(status, 'Tricycle saved with media and Bajaj Tricycles page updated.');
        } catch (error) {
            console.error('Unable to save tricycle listing.', error);
            setStatus(status, error.message || 'Unable to save the tricycle listing.', true);
        }
    });

    list.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const tricycle = tricycleCatalog.find(item => item.id === button.dataset.id);
        if (!tricycle) return;
        if (button.dataset.action === 'edit') {
            Object.entries(fields).forEach(([key, input]) => {
                input.value = tricycle[key] || '';
            });
            cancel.classList.remove('hidden');
            tricycleAdminForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        (async () => {
            try {
                const nextCatalog = tricycleCatalog.filter(item => item.id !== tricycle.id);
                saveCatalog('zackconnect-tricycles', nextCatalog);
                tricycleCatalog = nextCatalog;
                await deleteMediaFile(tricycle.photoMediaId);
                for (const mediaId of tricycle.videoMediaIds || []) await deleteMediaFile(mediaId);
                renderTricycleAdminList();
                renderTricycles();
                setStatus(status, `${tricycle.name} removed.`);
            } catch (error) {
                console.error('Unable to delete tricycle listing.', error);
                setStatus(status, error.message || 'Unable to delete the tricycle listing.', true);
            }
        })();
    });

    cancel.addEventListener('click', resetTricycleForm);
    window.addEventListener('storage', (event) => {
        if (event.key !== 'zackconnect-tricycles') return;
        tricycleCatalog = loadCatalog('zackconnect-tricycles', defaultTricycles);
        renderTricycleAdminList();
        renderTricycles();
    });
    renderTricycleAdminList();
}

const enquiryForm = document.getElementById('enquiryForm');
if (enquiryForm) {
    const status = document.getElementById('enquirySubmitStatus');
    enquiryForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = new FormData(enquiryForm);
        try {
            const enquiries = loadCatalog('zackconnect-enquiries', []);
            enquiries.unshift({
                id: `enquiry-${Date.now()}`,
                name: String(values.get('fullname') || '').trim(),
                phone: String(values.get('phone') || '').trim(),
                email: String(values.get('email') || '').trim(),
                service: String(values.get('service') || '').trim(),
                message: String(values.get('message') || '').trim(),
                status: 'Pending',
                submittedAt: new Date().toISOString()
            });
            saveCatalog('zackconnect-enquiries', enquiries);
            enquiryForm.reset();
            setStatus(status, 'Your enquiry has been submitted successfully.');
        } catch (error) {
            console.error('Unable to submit enquiry.', error);
            setStatus(status, error.message || 'Unable to submit your enquiry. Please try again.', true);
        }
    });
}

const bundleSupportForm = document.getElementById('bundleSupportForm');
const bundleSupportLauncher = document.getElementById('bundleSupportLauncher');
const bundleSupportPanel = document.getElementById('bundleSupportPanel');
const bundleSupportClose = document.getElementById('bundleSupportClose');
if (bundleSupportForm && bundleSupportLauncher && bundleSupportPanel && bundleSupportClose) {
    const status = document.getElementById('bundleSupportStatus');
    const contactView = document.getElementById('bundleSupportContactView');
    const inbox = document.getElementById('bundleSupportInbox');
    const chatClose = document.getElementById('bundleChatClose');
    const chatCompose = document.getElementById('bundleChatCompose');
    const chatSearch = document.getElementById('bundleChatSearch');
    const chatTabs = Array.from(inbox.querySelectorAll('[data-chat-tab]'));
    const chatPanels = Array.from(inbox.querySelectorAll('[data-chat-panel]'));
    const chatSettingsForm = document.getElementById('bundleChatSettingsForm');
    const chatSettingsStatus = document.getElementById('bundleChatSettingsStatus');
    const chatSettingsName = document.getElementById('bundleSettingsName');
    const chatSettingsPhone = document.getElementById('bundleSettingsPhone');
    const settingsProfile = document.getElementById('bundleSettingsProfile');
    const settingsProfileName = document.getElementById('bundleSettingsProfileName');
    const settingsProfilePhone = document.getElementById('bundleSettingsProfilePhone');
    const settingsAccount = document.getElementById('bundleSettingsAccount');
    const settingsNotifications = document.getElementById('bundleSettingsNotifications');
    const callSupportLink = document.getElementById('bundleSupportCallLink');
    const callHistoryList = document.getElementById('bundleCallHistoryList');
    const callHistoryEmpty = document.getElementById('bundleCallEmpty');
    const callHistoryKey = 'zackconnect-bundle-call-history';
    const chatRow = document.getElementById('bundleSupportChatRow');
    const chatPreview = document.getElementById('bundleChatPreview');
    const chatEmpty = document.getElementById('bundleChatEmpty');
    const conversation = document.getElementById('bundleSupportConversation');
    const conversationMessages = document.getElementById('bundleConversationMessages');
    const conversationForm = document.getElementById('bundleConversationForm');
    const conversationInput = document.getElementById('bundleConversationInput');
    const conversationBack = document.getElementById('bundleConversationBack');
    const conversationClose = document.getElementById('bundleConversationClose');
    const supportMessagesKey = 'zackconnect-bundle-support-chat';
    let supportMessages = loadCatalog(supportMessagesKey, []);
    const supportContactKey = 'zackconnect-bundle-support-contact';
    const storedSupportContacts = loadCatalog(supportContactKey, []);
    let supportContact = storedSupportContacts[0] || supportMessages.find(message => message.name && message.phone) || null;
    let activeView = supportContact ? 'inbox' : 'contact';

    function renderSupportMessages() {
        conversationMessages.replaceChildren();
        supportMessages.forEach((message) => {
            const bubble = document.createElement('div');
            bubble.className = `bundle-message-bubble ${message.direction === 'outgoing' ? 'outgoing' : 'incoming'}`;
            const text = document.createElement('p');
            text.textContent = message.text;
            const time = document.createElement('time');
            time.dateTime = message.sentAt;
            time.textContent = new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            bubble.append(text, time);
            if (message.direction === 'outgoing') {
                bubble.append(createMessageDeliveryTicks('bundle-message-status'));
            }
            conversationMessages.append(bubble);
        });
        conversationMessages.scrollTop = conversationMessages.scrollHeight;
        if (supportMessages.length) {
            const lastMessage = supportMessages[supportMessages.length - 1];
            chatPreview.textContent = lastMessage.text;
        }
    }

    function saveSupportMessage(text, name, phone) {
        const enquiries = loadCatalog('zackconnect-enquiries', []);
        enquiries.unshift({
            id: `enquiry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name,
            phone,
            email: '',
            service: 'Data Bundle Support Chat',
            message: text,
            status: 'Pending',
            submittedAt: new Date().toISOString()
        });
        saveCatalog('zackconnect-enquiries', enquiries);

        const message = {
            direction: 'outgoing',
            text,
            name,
            phone,
            sentAt: new Date().toISOString()
        };
        supportMessages.push(message);
        saveCatalog(supportMessagesKey, supportMessages);
        chatPreview.textContent = text;
        renderSupportMessages();
    }

    function setBundleSupportOpen(isOpen) {
        if (!isOpen && activeView === 'conversation') {
            activeView = 'inbox';
            bundleSupportPanel.classList.remove('is-conversation');
            conversation.classList.add('hidden');
        }
        bundleSupportPanel.classList.toggle('hidden', !isOpen);
        bundleSupportPanel.parentElement.classList.toggle('is-open', isOpen);
        document.body.classList.toggle('bundle-support-open', isOpen);
        bundleSupportLauncher.setAttribute('aria-expanded', String(isOpen));
        if (isOpen && activeView === 'inbox') chatSearch.focus();
        else if (isOpen) bundleSupportClose.focus();
        else bundleSupportLauncher.focus();
    }

    function showBundleSupportView(view) {
        activeView = view;
        const showInbox = view === 'inbox';
        contactView.classList.toggle('hidden', showInbox);
        inbox.classList.toggle('hidden', !showInbox);
        conversation.classList.add('hidden');
        bundleSupportPanel.classList.toggle('is-inbox', showInbox);
        bundleSupportPanel.classList.remove('is-conversation');
        if (showInbox) chatSearch.focus();
        else bundleSupportClose.focus();
    }

    function showSupportConversation() {
        activeView = 'conversation';
        inbox.classList.remove('hidden');
        conversation.classList.remove('hidden');
        bundleSupportPanel.classList.add('is-inbox', 'is-conversation');
        renderSupportMessages();
        conversationInput.focus();
    }

    function selectChatTab(tabName) {
        chatTabs.forEach((tab) => {
            const isActive = tab.dataset.chatTab === tabName;
            tab.classList.toggle('active', isActive);
            if (isActive) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });
        chatPanels.forEach((panel) => {
            panel.classList.toggle('hidden', panel.dataset.chatPanel !== tabName);
        });
        inbox.classList.toggle('showing-chats', tabName === 'chats');
        inbox.classList.toggle('showing-settings', tabName === 'settings');
        if (tabName === 'settings') {
            chatSettingsName.value = supportContact?.name || '';
            chatSettingsPhone.value = supportContact?.phone || '';
            settingsProfileName.textContent = supportContact?.name || 'Your profile';
            settingsProfilePhone.textContent = supportContact?.phone || 'Add a phone number';
            setStatus(chatSettingsStatus, '');
        }
        if (tabName === 'chats') chatSearch.focus();
    }

    function renderCallHistory() {
        const calls = loadCatalog(callHistoryKey, []);
        callHistoryList.replaceChildren();
        callHistoryEmpty.classList.toggle('hidden', calls.length > 0);
        calls.forEach((call) => {
            const entry = createElement('article', 'bundle-call-history-entry');
            entry.append(
                createElement('span', 'bundle-call-history-icon', '↗'),
                createElement('span', 'bundle-call-history-description', `Outgoing call · ${call.number}`),
                createElement('time', 'bundle-call-history-time',
                    new Date(call.startedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
            );
            callHistoryList.append(entry);
        });
    }

    renderSupportMessages();
    renderCallHistory();
    const notificationPreference = loadCatalog('zackconnect-bundle-support-notifications', [false]);
    const notificationsEnabled = notificationPreference[0] === true;
    settingsNotifications.setAttribute('aria-checked', String(notificationsEnabled));
    settingsNotifications.classList.toggle('enabled', notificationsEnabled);
    showBundleSupportView(activeView);
    selectChatTab('chats');
    bundleSupportLauncher.addEventListener('click', () => {
        setBundleSupportOpen(bundleSupportPanel.classList.contains('hidden'));
    });
    document.querySelectorAll('.footer-chat-launcher').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            setBundleSupportOpen(true);
        });
    });
    bundleSupportClose.addEventListener('click', () => setBundleSupportOpen(false));
    chatClose.addEventListener('click', () => setBundleSupportOpen(false));
    chatCompose.addEventListener('click', () => {
        if (supportContact) {
            showSupportConversation();
        } else {
            bundleSupportForm.reset();
            setStatus(status, '');
            showBundleSupportView('contact');
        }
    });
    chatSearch.addEventListener('input', () => {
        const matches = 'support team'.includes(chatSearch.value.trim().toLowerCase());
        chatRow.classList.toggle('hidden', !matches);
        chatEmpty.classList.toggle('hidden', matches);
    });
    chatTabs.forEach((tab) => {
        tab.addEventListener('click', () => selectChatTab(tab.dataset.chatTab));
    });
    function toggleSettingsAccountEditor() {
        const isExpanded = settingsAccount.getAttribute('aria-expanded') === 'true';
        settingsAccount.setAttribute('aria-expanded', String(!isExpanded));
        settingsProfile.setAttribute('aria-expanded', String(!isExpanded));
        chatSettingsForm.classList.toggle('hidden', isExpanded);
        if (!isExpanded) chatSettingsName.focus();
    }
    settingsProfile.addEventListener('click', toggleSettingsAccountEditor);
    settingsAccount.addEventListener('click', toggleSettingsAccountEditor);
    settingsNotifications.addEventListener('click', () => {
        const isEnabled = settingsNotifications.getAttribute('aria-checked') === 'true';
        const nextValue = !isEnabled;
        saveCatalog('zackconnect-bundle-support-notifications', [nextValue]);
        settingsNotifications.setAttribute('aria-checked', String(nextValue));
        settingsNotifications.classList.toggle('enabled', nextValue);
    });
    callSupportLink.addEventListener('click', () => {
        const calls = loadCatalog(callHistoryKey, []);
        calls.unshift({
            number: '+233 24 373 9221',
            startedAt: new Date().toISOString()
        });
        saveCatalog(callHistoryKey, calls.slice(0, 20));
        renderCallHistory();
    });
    chatSettingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
            supportContact = {
                name: chatSettingsName.value.trim(),
                phone: chatSettingsPhone.value.trim()
            };
            saveCatalog(supportContactKey, [supportContact]);
            settingsProfileName.textContent = supportContact.name;
            settingsProfilePhone.textContent = supportContact.phone;
            setStatus(chatSettingsStatus, 'Your contact details have been updated.');
        } catch (error) {
            console.error('Unable to update support chat contact details.', error);
            setStatus(chatSettingsStatus, error.message || 'Unable to save your details. Please try again.', true);
        }
    });
    chatRow.addEventListener('click', showSupportConversation);
    conversationBack.addEventListener('click', () => showBundleSupportView('inbox'));
    conversationClose.addEventListener('click', () => setBundleSupportOpen(false));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !bundleSupportPanel.classList.contains('hidden')) {
            setBundleSupportOpen(false);
        }
    });
    bundleSupportForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = new FormData(bundleSupportForm);
        try {
            supportContact = {
                name: String(values.get('name') || '').trim(),
                phone: String(values.get('phone') || '').trim()
            };
            saveCatalog(supportContactKey, [supportContact]);
            bundleSupportForm.reset();
            setBundleSupportOpen(true);
            showBundleSupportView('inbox');
        } catch (error) {
            console.error('Unable to send data bundle support message.', error);
            setStatus(status, error.message || 'Unable to send your message. Please try again.', true);
        }
    });
    conversationForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const message = conversationInput.value.trim();
        if (!message) return;
        if (!supportContact) {
            showBundleSupportView('contact');
            setStatus(status, 'Please enter your name and phone number before messaging support.', true);
            return;
        }
        try {
            saveSupportMessage(message, supportContact.name, supportContact.phone);
            conversationForm.reset();
        } catch (error) {
            console.error('Unable to send data bundle support chat message.', error);
            setStatus(status, error.message || 'Unable to send your message. Please try again.', true);
        }
    });
    window.addEventListener('storage', (event) => {
        if (event.key !== supportMessagesKey) return;
        supportMessages = loadCatalog(supportMessagesKey, []);
        renderSupportMessages();
    });
    if (window.location.hash === '#support-chat') setBundleSupportOpen(true);
}

const startSoftwareProjectButton = document.getElementById('startSoftwareProject');
const softwareProjectForm = document.getElementById('softwareProjectForm');
if (startSoftwareProjectButton && softwareProjectForm) {
    const status = document.getElementById('softwareProjectStatus');
    startSoftwareProjectButton.addEventListener('click', () => {
        const isOpen = !softwareProjectForm.classList.contains('hidden');
        softwareProjectForm.classList.toggle('hidden', isOpen);
        startSoftwareProjectButton.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) {
            softwareProjectForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    softwareProjectForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = softwareProjectForm.querySelector('button[type="submit"]');
        const values = new FormData(softwareProjectForm);
        const brief = values.get('brief');
        let briefMediaId = '';
        submitButton.disabled = true;
        setStatus(status, '');
        try {
            if (brief instanceof File && brief.size > 0) {
                briefMediaId = await saveMediaFile(brief, 'pdf');
            }
            const projects = loadCatalog('zackconnect-software-projects', []);
            projects.unshift({
                id: `software-project-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: String(values.get('name') || '').trim(),
                email: String(values.get('email') || '').trim(),
                phone: String(values.get('phone') || '').trim(),
                projectName: String(values.get('projectName') || '').trim(),
                description: String(values.get('description') || '').trim(),
                briefMediaId,
                briefName: brief instanceof File ? brief.name : '',
                submittedAt: new Date().toISOString()
            });
            try {
                saveCatalog('zackconnect-software-projects', projects);
            } catch (error) {
                if (briefMediaId) await deleteMediaFile(briefMediaId);
                throw error;
            }
            softwareProjectForm.reset();
            setStatus(status, 'Your software project request has been sent successfully.');
        } catch (error) {
            console.error('Unable to submit software project request.', error);
            setStatus(status, error.message || 'Unable to submit your project request. Please try again.', true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

const startCarImportButton = document.getElementById('startCarImport');
const requestImportCostsButton = document.getElementById('requestImportCosts');
const carImportRequestForm = document.getElementById('carImportRequestForm');
if (startCarImportButton && carImportRequestForm) {
    const status = document.getElementById('carImportRequestStatus');
    const requestTypeInput = carImportRequestForm.querySelector('[name="requestType"]');
    const requestTitle = document.getElementById('carImportRequestTitle');
    const requestDescription = document.getElementById('carImportRequestDescription');
    const submitButton = document.getElementById('carImportSubmit');
    const carMakeInput = carImportRequestForm.querySelector('[name="carMake"]');
    const carModelInput = carImportRequestForm.querySelector('[name="carModel"]');
    const carModelSuggestions = document.getElementById('carModelSuggestions');
    const carModelsByMake = {
        Jetour: ['X50', 'X70', 'X70 Plus', 'X90 Plus', 'Dashing', 'T2', 'X90 Pro', 'Shanhai L6', 'Shanhai L7'],
        Changan: ['Alsvin', 'Eado', 'CS15', 'CS35 Plus', 'CS55 Plus', 'CS75 Plus', 'CS95', 'UNI-T', 'UNI-V', 'Hunter', 'Kaicene Star'],
        Aion: ['Y', 'S', 'V', 'LX'],
        Avatr: ['06', '07', '11', '12'],
        BAIC: ['X35', 'X55', 'X7', 'BJ40'],
        Baojun: ['Yep', 'KiWi EV', '510', '530'],
        Bestune: ['T55', 'T77', 'T90', 'B70'],
        BYD: ['Seagull', 'Dolphin', 'Atto 3', 'Yuan Plus', 'Song Plus', 'Qin Plus', 'Seal', 'Tang'],
        Chery: ['Tiggo 2 Pro', 'Tiggo 4 Pro', 'Tiggo 7 Pro', 'Tiggo 8 Pro', 'Arrizo 5'],
        Deepal: ['S05', 'S07', 'S09', 'L07', 'G318'],
        Denza: ['D9', 'N7', 'N8', 'Z9 GT'],
        DFSK: ['Glory 500', 'Glory 580', 'Glory 560', 'C31', 'C32'],
        Dongfeng: ['Aeolus Shine', 'Mage', 'Huge', 'Rich 6'],
        Exeed: ['LX', 'TXL', 'RX', 'VX'],
        FAW: ['T77', 'T99', 'Bestune B70', 'J6'],
        Foton: ['Tunland', 'View CS2', 'Toano', 'Gratour'],
        GAC: ['GS3', 'GS4', 'GS8', 'Empow', 'Aion Y'],
        Geely: ['X3 Pro', 'Coolray', 'Emgrand', 'Starray', 'Monjaro', 'Geometry C'],
        'Great Wall': ['Poer', 'Wingle 5', 'Wingle 7'],
        Haval: ['Jolion', 'H6', 'H6 HEV', 'H9', 'Dargo'],
        Hongqi: ['H5', 'H6', 'HS3', 'HS5', 'HS7'],
        JAC: ['S2', 'S3', 'JS4', 'JS6', 'T8', 'T9'],
        Jaecoo: ['J5', 'J7', 'J8'],
        Leapmotor: ['T03', 'C10', 'C11', 'C16'],
        'Li Auto': ['L6', 'L7', 'L8', 'L9'],
        'Lynk & Co': ['06', '08', '09', 'Z20'],
        Maxus: ['G50', 'G90', 'T60', 'T90', 'D60'],
        Neta: ['AYA', 'X', 'L', 'S'],
        NIO: ['ET5', 'ET5 Touring', 'ET7', 'ES6', 'EL6', 'EC6'],
        Omoda: ['C5', 'C7', 'E5'],
        Seres: ['3', '5', '7'],
        Soueast: ['S06', 'S07', 'S09'],
        Tank: ['300', '400', '500', '700'],
        Wuling: ['Hongguang Mini EV', 'Bingo', 'Starlight', 'Asta'],
        XPeng: ['M03', 'G6', 'G9', 'P7+', 'X9'],
        Zeekr: ['001', '007', '7X', '009', 'X']
    };

    function updateCarModelSuggestions() {
        carModelSuggestions.replaceChildren();
        for (const model of carModelsByMake[carMakeInput.value] || []) {
            const option = document.createElement('option');
            option.value = model;
            carModelSuggestions.append(option);
        }
    }

    carMakeInput.addEventListener('change', updateCarModelSuggestions);

    function openCarImportForm(requestType, carName = '') {
        requestTypeInput.value = requestType;
        const isEstimate = requestType === 'estimate';
        requestTitle.textContent = isEstimate ? 'Request an import cost estimate' : 'Tell us what car you’re looking for';
        requestDescription.textContent = isEstimate
            ? 'Share the vehicle and destination port. We’ll prepare an estimate covering port charges, import charges, and shipping insurance.'
            : 'Share your contact details, budget, and preferred car. We’ll get in touch to discuss your import and related charges.';
        submitButton.textContent = isEstimate ? 'Request charges & insurance estimate' : 'Send car import request';
        if (carName) {
            const make = Array.from(carMakeInput.options)
                .find(option => option.value !== 'Other' && carName.toLowerCase().startsWith(`${option.value.toLowerCase()} `));
            carMakeInput.value = make ? make.value : 'Other';
            updateCarModelSuggestions();
            carModelInput.value = make ? carName.slice(make.value.length).trim() : carName;
        }
        carImportRequestForm.classList.remove('hidden');
        startCarImportButton.setAttribute('aria-expanded', 'true');
        requestImportCostsButton.setAttribute('aria-expanded', 'true');
        carImportRequestForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    startCarImportButton.addEventListener('click', () => openCarImportForm('import'));
    requestImportCostsButton.addEventListener('click', () => openCarImportForm('estimate'));

    document.querySelector('.car-grid')?.addEventListener('click', (event) => {
        const button = event.target.closest('.car-request-button');
        if (button) openCarImportForm('import', button.dataset.carName);
    });

    carImportRequestForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = new FormData(carImportRequestForm);
        const budget = Number(values.get('budget'));
        if (!Number.isFinite(budget) || budget <= 0) {
            setStatus(status, 'Enter a valid budget greater than zero.', true);
            return;
        }
        submitButton.disabled = true;
        setStatus(status, '');
        try {
            const enquiries = loadCatalog('zackconnect-enquiries', []);
            const preferences = String(values.get('preferences') || '').trim();
            const isEstimate = values.get('requestType') === 'estimate';
            const message = [
                `Request: ${isEstimate ? 'Import cost estimate' : 'Car import'}`,
                `Budget: ${String(values.get('currency') || '').trim()} ${budget.toLocaleString()}`,
                `Car wanted: ${String(values.get('carMake') || '').trim()} ${String(values.get('carModel') || '').trim()}`,
                `Import from: ${String(values.get('importCountry') || '').trim()}`,
                `Destination port: ${String(values.get('destinationPort') || '').trim()}`,
                'Estimate requested for: port charges, import charges, and shipping insurance',
                `Type: ${String(values.get('carType') || '').trim()}`,
                `Condition: ${String(values.get('condition') || '').trim()}`,
                preferences ? `Additional preferences: ${preferences}` : ''
            ].filter(Boolean).join('\n');
            enquiries.unshift({
                id: `enquiry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: String(values.get('name') || '').trim(),
                phone: String(values.get('phone') || '').trim(),
                email: String(values.get('email') || '').trim(),
                service: isEstimate ? 'Car Import Cost Estimate' : 'Car Import',
                message,
                status: 'Pending',
                submittedAt: new Date().toISOString()
            });
            saveCatalog('zackconnect-enquiries', enquiries);
            carImportRequestForm.reset();
            setStatus(status, 'Your car import request has been sent successfully.');
        } catch (error) {
            console.error('Unable to submit car import request.', error);
            setStatus(status, error.message || 'Unable to submit your car import request. Please try again.', true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

const openCarCostInfoFormButton = document.getElementById('openCarCostInfoForm');
const carCostInfoForm = document.getElementById('carCostInfoForm');
if (openCarCostInfoFormButton && carCostInfoForm) {
    const status = document.getElementById('carCostInfoStatus');
    openCarCostInfoFormButton.addEventListener('click', () => {
        const isOpen = !carCostInfoForm.classList.contains('hidden');
        carCostInfoForm.classList.toggle('hidden', isOpen);
        openCarCostInfoFormButton.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) carCostInfoForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    carCostInfoForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const submitButton = carCostInfoForm.querySelector('button[type="submit"]');
        const values = new FormData(carCostInfoForm);
        submitButton.disabled = true;
        setStatus(status, '');
        try {
            const enquiries = loadCatalog('zackconnect-enquiries', []);
            const details = String(values.get('details') || '').trim();
            const message = [
                'Request: Worldwide car import cost information',
                'Information fee: GH¢100 (payment to be arranged separately; not paid through this form)',
                `Vehicle: ${String(values.get('vehicle') || '').trim()} (${String(values.get('vehicleYear') || '').trim()})`,
                `Vehicle purchase price: ${String(values.get('vehiclePrice') || '').trim() || 'Not provided'}`,
                `Shipping from: ${String(values.get('originPort') || '').trim()}, ${String(values.get('originCountry') || '').trim()}`,
                `Shipping to: ${String(values.get('destinationPort') || '').trim()}, ${String(values.get('destinationCountry') || '').trim()}`,
                'Information requested: import charges, customs clearance, and shipping fees',
                details ? `Additional details: ${details}` : ''
            ].filter(Boolean).join('\n');
            enquiries.unshift({
                id: `enquiry-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: String(values.get('name') || '').trim(),
                phone: String(values.get('phone') || '').trim(),
                email: String(values.get('email') || '').trim(),
                service: 'Worldwide Import Cost Information — GH¢100',
                message,
                status: 'Pending',
                submittedAt: new Date().toISOString()
            });
            saveCatalog('zackconnect-enquiries', enquiries);
            carCostInfoForm.reset();
            setStatus(status, 'Your request has been sent to our admin team. The GH¢100 information fee will be arranged separately.');
        } catch (error) {
            console.error('Unable to submit worldwide import cost information request.', error);
            setStatus(status, error.message || 'Unable to submit your request. Please try again.', true);
        } finally {
            submitButton.disabled = false;
        }
    });
}

const adminEnquiriesList = document.getElementById('adminEnquiriesList');
if (adminEnquiriesList) {
    const count = document.getElementById('newEnquiriesCount');
    function renderEnquiries() {
        adminEnquiriesList.replaceChildren();
        const enquiries = loadCatalog('zackconnect-enquiries', []);
        count.textContent = String(enquiries.filter(item => item.status === 'Pending').length);
        if (!enquiries.length) {
            const empty = createElement('p', 'admin-empty-enquiries', 'No enquiries have been submitted yet.');
            adminEnquiriesList.append(empty);
            return;
        }
        enquiries.forEach((enquiry) => {
            const row = createElement('div', 'table-row');
            row.dataset.enquiryId = enquiry.id;
            const contact = [enquiry.email, enquiry.phone].filter(Boolean).join(' · ');
            const submitted = new Date(enquiry.submittedAt).toLocaleDateString();
            [
                enquiry.name,
                contact,
                enquiry.service,
                enquiry.message,
                enquiry.status,
                submitted
            ].forEach((text, index) => {
                const cell = createElement('div', 'table-cell', text);
                if (index === 3) {
                    cell.classList.add('enquiry-message-cell');
                    cell.title = text;
                }
                if (index === 4) {
                        const badge = createElement('span', `status-badge ${enquiry.status.toLowerCase().replace(/\s+/g, '-')}`, text);
                    cell.replaceChildren(badge);
                }
                row.append(cell);
            });
            const actionCell = createElement('div', 'table-cell');
            const viewed = createElement('button', 'action-button', enquiry.status === 'Pending' ? 'Mark viewed' : 'Viewed');
            viewed.type = 'button';
            viewed.disabled = enquiry.status !== 'Pending';
            viewed.dataset.enquiryId = enquiry.id;
            actionCell.append(viewed);
            row.append(actionCell);
            adminEnquiriesList.append(row);
        });
    }
    adminEnquiriesList.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-enquiry-id]');
        if (!button || button.disabled) return;
        const enquiries = loadCatalog('zackconnect-enquiries', []);
        const enquiry = enquiries.find(item => item.id === button.dataset.enquiryId);
        if (!enquiry) return;
        enquiry.status = 'In Progress';
        saveCatalog('zackconnect-enquiries', enquiries);
        renderEnquiries();
    });
    window.addEventListener('storage', (event) => {
        if (event.key === 'zackconnect-enquiries') renderEnquiries();
    });
    renderEnquiries();
}

const adminBundleOrdersList = document.getElementById('adminBundleOrdersList');
if (adminBundleOrdersList) {
    const count = document.getElementById('bundleOrdersCount');
    const status = document.getElementById('adminBundleOrdersStatus');

    async function loadBundleOrders() {
        adminBundleOrdersList.replaceChildren();
        setStatus(status, '');
        try {
            const { orders } = await apiRequest('/bundle-orders');
            if (!Array.isArray(orders)) throw new Error('The server returned an invalid bundle order list.');
            count.textContent = String(orders.length);
            if (!orders.length) {
                adminBundleOrdersList.append(createElement('p', 'admin-empty-enquiries', 'No bundle orders have been recorded yet.'));
                return;
            }
            orders.forEach((order) => {
                const row = createElement('div', 'table-row');
                const date = new Date(order.created_at);
                const values = [
                    order.order_code,
                    order.recipient_phone,
                    `${order.size} - ${order.network}`,
                    formatBundlePrice(order.price),
                    order.status,
                    Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
                ];
                values.forEach((value, index) => {
                    const cell = createElement('div', 'table-cell');
                    if (index === 4) {
                        cell.append(createElement('span', 'status-badge pending', value));
                    } else {
                        cell.textContent = value;
                    }
                    row.append(cell);
                });
                adminBundleOrdersList.append(row);
            });
        } catch (error) {
            console.error('Unable to load bundle order history.', error);
            count.textContent = '—';
            setStatus(status, error.message || 'Unable to load bundle order history.', true);
        }
    }

    loadBundleOrders();
}

const adminSupportChatList = document.getElementById('adminSupportChatList');
if (adminSupportChatList) {
    const supportMessagesKey = 'zackconnect-bundle-support-chat';
    const supportContactKey = 'zackconnect-bundle-support-contact';
    const supportConversationMessages = document.getElementById('adminSupportMessages');
    const customerName = document.getElementById('adminSupportCustomerName');
    const customerPhone = document.getElementById('adminSupportCustomerPhone');
    const replyForm = document.getElementById('adminSupportReplyForm');
    const replyInput = document.getElementById('adminSupportReplyInput');
    const replyButton = document.getElementById('adminSupportReplyButton');
    const status = document.getElementById('adminSupportStatus');
    let supportMessages = loadCatalog(supportMessagesKey, []);
    let supportContacts = loadCatalog(supportContactKey, []);
    if (!supportContacts.length) {
        supportContacts = Array.from(new Map(
            supportMessages
                .filter(message => message.phone)
                .map(message => [message.phone, { name: message.name || 'Customer', phone: message.phone }])
        ).values());
    }
    let selectedContact = null;

    function renderSupportConversation() {
        supportConversationMessages.replaceChildren();
        if (!selectedContact) {
            supportConversationMessages.append(
                createElement('p', 'admin-empty-enquiries', 'Select a customer chat to read and reply.')
            );
            return;
        }

        const customerMessages = supportMessages.filter(message => message.phone === selectedContact.phone);
        if (!customerMessages.length) {
            supportConversationMessages.append(
                createElement('p', 'admin-empty-enquiries', 'No messages yet. You can send the first reply.')
            );
            return;
        }

        customerMessages.forEach((message) => {
            const bubble = createElement(
                'article',
                `admin-support-message ${message.direction === 'incoming' ? 'from-admin' : 'from-customer'}`
            );
            bubble.append(
                createElement('p', 'admin-support-message-text', message.text),
                createElement('time', 'admin-support-message-time',
                    new Date(message.sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))
            );
            if (message.direction === 'incoming') {
                bubble.append(createMessageDeliveryTicks('admin-support-message-status'));
            }
            supportConversationMessages.append(bubble);
        });
        supportConversationMessages.scrollTop = supportConversationMessages.scrollHeight;
    }

    function renderSupportChatList() {
        adminSupportChatList.replaceChildren();
        if (!supportContacts.length) {
            adminSupportChatList.append(
                createElement('p', 'admin-empty-enquiries', 'No customer support chats yet.')
            );
            selectedContact = null;
            customerName.textContent = 'Support Team';
            customerPhone.textContent = 'Select a conversation';
            replyInput.disabled = true;
            replyButton.disabled = true;
            renderSupportConversation();
            return;
        }

        supportContacts.forEach((contact) => {
            const messages = supportMessages.filter(message => message.phone === contact.phone);
            const latestMessage = messages[messages.length - 1];
            const button = createElement('button', 'admin-support-chat-item');
            button.type = 'button';
            button.classList.toggle('active', selectedContact?.phone === contact.phone);
            button.dataset.supportPhone = contact.phone;
            button.append(
                createElement('span', 'admin-support-avatar', (contact.name || 'S').charAt(0).toUpperCase())
            );
            const details = createElement('span', 'admin-support-chat-item-details');
            details.append(
                createElement('strong', '', contact.name || 'Customer'),
                createElement('span', '', latestMessage?.text || contact.phone)
            );
            button.append(details);
            adminSupportChatList.append(button);
        });

        if (!selectedContact || !supportContacts.some(contact => contact.phone === selectedContact.phone)) {
            selectedContact = supportContacts[0];
        }
        customerName.textContent = selectedContact.name || 'Customer';
        customerPhone.textContent = selectedContact.phone;
        replyInput.disabled = false;
        replyButton.disabled = false;
        renderSupportConversation();
    }

    adminSupportChatList.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-support-phone]');
        if (!button) return;
        selectedContact = supportContacts.find(contact => contact.phone === button.dataset.supportPhone) || null;
        adminSupportChatList.querySelectorAll('.admin-support-chat-item')
            .forEach(item => item.classList.toggle('active', item === button));
        if (selectedContact) {
            customerName.textContent = selectedContact.name || 'Customer';
            customerPhone.textContent = selectedContact.phone;
            replyInput.disabled = false;
            replyButton.disabled = false;
        }
        renderSupportConversation();
    });

    replyForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!selectedContact) return;
        const text = replyInput.value.trim();
        if (!text) return;
        try {
            supportMessages.push({
                direction: 'incoming',
                text,
                name: selectedContact.name,
                phone: selectedContact.phone,
                sentAt: new Date().toISOString()
            });
            saveCatalog(supportMessagesKey, supportMessages);
            replyForm.reset();
            setStatus(status, 'Reply sent.');
            renderSupportChatList();
        } catch (error) {
            console.error('Unable to send support chat reply.', error);
            setStatus(status, error.message || 'Unable to send your reply. Please try again.', true);
        }
    });

    window.addEventListener('storage', (event) => {
        if (event.key === supportMessagesKey) {
            supportMessages = loadCatalog(supportMessagesKey, []);
            renderSupportChatList();
        }
        if (event.key === supportContactKey) {
            supportContacts = loadCatalog(supportContactKey, []);
            renderSupportChatList();
        }
    });

    renderSupportChatList();
}

const adminSoftwareProjectsList = document.getElementById('adminSoftwareProjectsList');
if (adminSoftwareProjectsList) {
    const status = document.getElementById('adminSoftwareProjectsStatus');
    function renderSoftwareProjects() {
        adminSoftwareProjectsList.replaceChildren();
        const projects = loadCatalog('zackconnect-software-projects', []);
        if (!projects.length) {
            adminSoftwareProjectsList.append(createElement('p', 'admin-empty-enquiries', 'No software project requests have been submitted yet.'));
            return;
        }
        projects.forEach((project) => {
            const card = createElement('article', 'software-project-admin-card');
            const heading = createElement('h3', '', project.projectName);
            const contact = createElement('p', 'software-project-admin-contact',
                [project.name, project.email, project.phone].filter(Boolean).join(' · '));
            const description = createElement('p', 'software-project-admin-description', project.description);
            const submitted = createElement('p', 'software-project-admin-date',
                `Submitted ${new Date(project.submittedAt).toLocaleString()}`);
            card.append(heading, contact, description, submitted);
            if (project.briefMediaId) {
                const download = createElement('button', 'action-button', `Download PDF${project.briefName ? `: ${project.briefName}` : ''}`);
                download.type = 'button';
                download.dataset.briefMediaId = project.briefMediaId;
                download.dataset.briefName = project.briefName || 'project-brief.pdf';
                card.append(download);
            } else {
                card.append(createElement('p', 'software-project-admin-date', 'No PDF attached.'));
            }
            adminSoftwareProjectsList.append(card);
        });
    }

    adminSoftwareProjectsList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-brief-media-id]');
        if (!button) return;
        button.disabled = true;
        setStatus(status, '');
        try {
            const media = await getMediaFile(button.dataset.briefMediaId);
            if (!media?.blob) {
                throw new Error('The attached PDF could not be found in this browser.');
            }
            const link = document.createElement('a');
            link.href = createMediaUrl(media);
            link.download = button.dataset.briefName || media.name || 'project-brief.pdf';
            link.click();
        } catch (error) {
            console.error('Unable to download software project PDF.', error);
            setStatus(status, error.message || 'Unable to download the attached PDF.', true);
        } finally {
            button.disabled = false;
        }
    });
    window.addEventListener('storage', (event) => {
        if (event.key === 'zackconnect-software-projects') renderSoftwareProjects();
    });
    renderSoftwareProjects();
}

window.addEventListener('storage', (event) => {
    if (event.key === 'zackconnect-cars' && document.querySelector('.car-grid')) {
        carCatalog = loadCatalog('zackconnect-cars', defaultCars);
        renderCars();
    } else if (event.key === 'zackconnect-tricycles' && document.querySelector('.tricycle-grid')) {
        tricycleCatalog = loadCatalog('zackconnect-tricycles', defaultTricycles);
        renderTricycles();
    }
});

if (document.querySelector('.bundle-grid') && !bundleAdminForm) refreshBundleCatalog();

console.log('Zackconnect website loaded successfully!');