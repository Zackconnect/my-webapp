const authStorageKey = 'zackconnect-users';
const authSessionKey = 'zackconnect-auth-session';
const authReturnPages = new Set([
    'index.html',
    'software.html',
    'car-import.html',
    'data-bundels.html',
    'bajaj.html',
    'enquire.html',
    'admin.html'
]);

function getAuthSession() {
    try {
        const serialized = localStorage.getItem(authSessionKey) || sessionStorage.getItem(authSessionKey);
        if (!serialized) return null;
        const session = JSON.parse(serialized);
        return session && typeof session.email === 'string' ? session : null;
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

function setAuthSession(user, remember) {
    const session = JSON.stringify({ email: user.email, name: user.name });
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

async function hashAuthPassword(password, salt) {
    if (!window.crypto?.subtle) {
        throw new Error('Secure sign-in is unavailable in this browser context. Open the site through localhost or HTTPS.');
    }
    const key = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt,
        iterations: 210000,
        hash: 'SHA-256'
    }, key, 256);
    return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
    return Uint8Array.from(hex.match(/.{2}/g) || [], byte => Number.parseInt(byte, 16));
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
            const users = loadCatalog(authStorageKey, []);
            if (users.some(user => user.email === email)) {
                setStatus(status, 'An account with this email already exists. Please log in.', true);
                return;
            }
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const passwordHash = await hashAuthPassword(password, salt);
            const user = {
                name,
                email,
                phone: String(values.get('phone') || '').trim(),
                passwordSalt: Array.from(salt, byte => byte.toString(16).padStart(2, '0')).join(''),
                passwordHash
            };
            users.push(user);
            saveCatalog(authStorageKey, users);
            setAuthSession(user, Boolean(values.get('remember')));
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
            const users = loadCatalog(authStorageKey, []);
            const user = users.find(item => item.email === email);
            if (!user) {
                setStatus(status, 'No account was found for this email. Please sign up below.', true);
                return;
            }
            if (!user.passwordSalt || !user.passwordHash) {
                setStatus(status, 'This account cannot be verified. Please sign up below.', true);
                return;
            }
            const enteredHash = await hashAuthPassword(password, hexToBytes(user.passwordSalt));
            if (enteredHash !== user.passwordHash) {
                setStatus(status, 'Email or password is incorrect. Please check your details or sign up below.', true);
                return;
            }
            setAuthSession(user, Boolean(values.get('remember')));
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

const defaultBundles = [
    ['MTN', '1GB', 4.9], ['MTN', '2GB', 9.8], ['MTN', '3GB', 16], ['MTN', '4GB', 19.5],
    ['MTN', '5GB', 23.5], ['MTN', '6GB', 29], ['MTN', '8GB', 37], ['MTN', '10GB', 44],
    ['MTN', '15GB', 64], ['MTN', '20GB', 84], ['MTN', '25GB', 105], ['MTN', '30GB', 128],
    ['MTN', '40GB', 167], ['MTN', '50GB', 215], ['MTN', '100GB', 365], ['MTN', '200GB', 420]
].map(([network, size, price], index) => ({
    id: `seed-bundle-${index + 1}`,
    network,
    size,
    price,
    validity: 'No-Expiry'
})).concat([
    ['10GB', 45], ['15GB', 65], ['20GB', 83], ['25GB', 100],
    ['30GB', 118], ['50GB', 200], ['100GB', 395]
].map(([size, price], index) => ({
    id: `seed-bundle-telecel-${index + 1}`,
    network: 'TELECEL',
    size,
    price,
    validity: 'No-Expiry'
}))).concat([
    ['1GB', 4.5], ['2GB', 9], ['3GB', 13.5], ['4GB', 17.5],
    ['5GB', 22], ['6GB', 25], ['7GB', 30], ['8GB', 33],
    ['10GB', 41], ['15GB', 61], ['20GB', 80], ['25GB', 100], ['50GB', 200]
].map(([size, price], index) => ({
    id: `seed-bundle-airteltigo-${index + 1}`,
    network: 'AIRTELTIGO',
    size,
    price,
    validity: 'No-Expiry'
})));

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

let bundleCatalog = loadCatalog('zackconnect-bundles', defaultBundles);
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

const bundleCatalogMigrationKeys = [
    'zackconnect-bundle-catalog-telecel-v1',
    'zackconnect-bundle-catalog-airteltigo-v1'
];
bundleCatalogMigrationKeys.forEach((migrationKey) => {
    if (localStorage.getItem(migrationKey)) return;
    const existingBundleIds = new Set(bundleCatalog.map(bundle => bundle.id));
    const newDefaults = defaultBundles.filter(bundle => !existingBundleIds.has(bundle.id));
    if (newDefaults.length) {
        bundleCatalog = [...bundleCatalog, ...newDefaults];
        saveCatalog('zackconnect-bundles', bundleCatalog);
    }
    localStorage.setItem(migrationKey, 'complete');
});

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
    const closeButton = document.querySelector('.bundle-modal-close');
    const bundleGrid = document.querySelector('.bundle-grid');

    bundleGrid?.addEventListener('click', (event) => {
        const card = event.target.closest('.bundle-card');
        if (!card) return;
        const bundle = bundleCatalog.find(item => item.id === card.dataset.bundleId);
        if (!bundle) return;
        const price = formatBundlePrice(bundle.price);

        if (modalTitle) modalTitle.textContent = `${bundle.size} - ${bundle.network}`;
        if (modalTotal) modalTotal.textContent = price;
        if (payButton) {
            payButton.textContent = `Pay ${price}`;
            payButton.classList.remove('network-mtn', 'network-telecel', 'network-airteltigo', 'network-afa-reg');
            const networkClass = bundle.network.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            payButton.classList.add(`network-${networkClass}`);
        }
        bundleModal.classList.remove('hidden');
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

    bundleAdminForm.addEventListener('submit', (event) => {
        event.preventDefault();
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
        if (bundleAdminId.value && duplicate) {
            setStatus(bundleAdminStatus, 'That network already has a bundle with this size.', true);
            return;
        }

        const matchingBundle = bundleCatalog.find(item =>
            item.network === bundleAdminNetwork.value && item.size === size
        );
        const id = bundleAdminId.value || matchingBundle?.id || `bundle-${Date.now()}`;
        const bundle = {
            id,
            network: bundleAdminNetwork.value,
            size,
            price,
            validity: bundleAdminValidity.value.trim() || 'No-Expiry'
        };
        const existingIndex = bundleCatalog.findIndex(item => item.id === id);
        if (existingIndex >= 0) bundleCatalog[existingIndex] = bundle;
        else bundleCatalog.push(bundle);

        saveCatalog('zackconnect-bundles', bundleCatalog);
        renderBundleAdminList();
        renderBundles();
        resetBundleForm();
        setStatus(bundleAdminStatus, 'Bundle saved and storefront updated.');
    });

    bundleAdminList.addEventListener('click', (event) => {
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

        bundleCatalog = bundleCatalog.filter(item => item.id !== bundle.id);
        saveCatalog('zackconnect-bundles', bundleCatalog);
        renderBundleAdminList();
        renderBundles();
        setStatus(bundleAdminStatus, `${bundle.network} ${bundle.size} removed.`);
    });

    bundleAdminCancel.addEventListener('click', resetBundleForm);
    window.addEventListener('storage', (event) => {
        if (event.key !== 'zackconnect-bundles') return;
        bundleCatalog = loadCatalog('zackconnect-bundles', defaultBundles);
        renderBundleAdminList();
        renderBundles();
    });
    renderBundleAdminList();
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
    if (event.key === 'zackconnect-bundles' && document.querySelector('.bundle-grid')) {
        bundleCatalog = loadCatalog('zackconnect-bundles', defaultBundles);
        renderBundles();
    } else if (event.key === 'zackconnect-cars' && document.querySelector('.car-grid')) {
        carCatalog = loadCatalog('zackconnect-cars', defaultCars);
        renderCars();
    } else if (event.key === 'zackconnect-tricycles' && document.querySelector('.tricycle-grid')) {
        tricycleCatalog = loadCatalog('zackconnect-tricycles', defaultTricycles);
        renderTricycles();
    }
});

console.log('Zackconnect website loaded successfully!');