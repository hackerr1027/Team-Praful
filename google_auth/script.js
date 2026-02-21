// Google OAuth configuration
const GOOGLE_CLIENT_ID = '263914103895-mcbbpm3o1qgjt1e9gr10ja2ltsq5jl1e.apps.googleusercontent.com';
let googleUser = null;
let pendingGoogleSignIn = false;

// Initialize Google Sign-In
function initializeGoogleSignIn() {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleSignIn,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        // Render Google Sign-In buttons
        renderGoogleSignInButton('google-signin-button');
        renderGoogleSignInButton('google-signin-button-register');
    } else {
        // Fallback: Show custom Google Sign-In button if Google script fails to load
        showCustomGoogleButtons();
        console.log('Google script not loaded, showing custom buttons');
    }
}

// Show custom Google Sign-In buttons as fallback
function showCustomGoogleButtons() {
    const loginButton = document.getElementById('google-signin-button');
    const registerButton = document.getElementById('google-signin-button-register');
    
    if (loginButton) {
        loginButton.innerHTML = `
            <button type="button" class="google-signin-button" onclick="handleCustomGoogleSignIn()">
                <svg class="google-logo" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
            </button>
        `;
    }
    
    if (registerButton) {
        registerButton.innerHTML = `
            <button type="button" class="google-signin-button" onclick="handleCustomGoogleSignIn()">
                <svg class="google-logo" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign up with Google
            </button>
        `;
    }
}

// Handle custom Google Sign-In (fallback)
function handleCustomGoogleSignIn() {
    if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com') {
        showMessage('Please configure Google OAuth first. Check GOOGLE_OAUTH_SETUP.md for instructions.', 'error');
        return;
    }
    
    // If Client ID is set but Google script didn't load, try to reload
    showMessage('Google OAuth not properly loaded. Please refresh the page.', 'error');
}

// Render Google Sign-In button
function renderGoogleSignInButton(elementId) {
    const element = document.getElementById(elementId);
    if (element && typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.renderButton(element, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left'
        });
    }
}

// Handle Google Sign-In response
function handleGoogleSignIn(response) {
    if (response.credential) {
        // Decode JWT token
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        googleUser = {
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            credential: response.credential
        };
        
        pendingGoogleSignIn = true;
        showRoleModal();
    }
}

// Show role selection modal
function showRoleModal() {
    const modal = document.getElementById('role-modal');
    modal.classList.add('show');
}

// Close role selection modal
function closeRoleModal() {
    const modal = document.getElementById('role-modal');
    modal.classList.remove('show');
    googleUser = null;
    pendingGoogleSignIn = false;
}

// Confirm Google Sign-In with selected role
function confirmGoogleSignIn() {
    const role = document.getElementById('modal-role').value;
    
    if (!role) {
        showMessage('Please select a role', 'error');
        return;
    }
    
    if (googleUser && pendingGoogleSignIn) {
        // Store user data
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', googleUser.email);
        localStorage.setItem('userName', googleUser.name);
        localStorage.setItem('userRole', role);
        localStorage.setItem('userPicture', googleUser.picture);
        localStorage.setItem('authMethod', 'google');
        
        closeRoleModal();
        showMessage('Successfully signed in with Google!', 'success');
        
        // Redirect based on role
        setTimeout(() => {
            if (role === 'fleet_manager') {
                // Open fleet dashboard in new tab - keep original UI separate
                const dashboardUrl = 'http://localhost:5501';
                showMessage('Opening Fleet Dashboard...', 'info');
                window.open(dashboardUrl, '_blank');
            } else {
                showMessage(`Welcome ${googleUser.name}! Dashboard for ${role.replace('_', ' ').toUpperCase()} would load here.`, 'info');
            }
        }, 1500);
    }
}

// Tab switching functionality
function showLogin() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    
    tabBtns[0].classList.add('active');
    tabBtns[1].classList.remove('active');
    
    clearForms();
}

function showRegister() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    
    tabBtns[0].classList.remove('active');
    tabBtns[1].classList.add('active');
    
    clearForms();
}

// Clear form inputs
function clearForms() {
    const forms = document.querySelectorAll('.auth-form form');
    forms.forEach(form => form.reset());
}

// Show message function
function showMessage(text, type = 'info') {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type} show`;
    
    setTimeout(() => {
        messageEl.classList.remove('show');
    }, 3000);
}

// Email validation
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Password validation
function validatePassword(password) {
    return password.length >= 8;
}

// Handle login form submission
function handleLogin(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const email = formData.get('email');
    const password = formData.get('password');
    
    // Validation
    if (!validateEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    if (!validatePassword(password)) {
        showMessage('Password must be at least 8 characters long', 'error');
        return;
    }
    
    // Simulate login process
    showMessage('Logging in...', 'info');
    
    // Simulate API call
    setTimeout(() => {
        // Mock successful login
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        showMessage('Login successful! Redirecting...', 'success');
        
        // Redirect to dashboard (mock)
        setTimeout(() => {
            showMessage('Dashboard would load here', 'info');
        }, 1500);
    }, 1000);
}

// Handle register form submission
function handleRegister(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const name = formData.get('name');
    const email = formData.get('email');
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const role = formData.get('role');
    
    // Validation
    if (name.trim().length < 2) {
        showMessage('Please enter your full name', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    if (!validatePassword(password)) {
        showMessage('Password must be at least 8 characters long', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }
    
    if (!role) {
        showMessage('Please select a role', 'error');
        return;
    }
    
    // Simulate registration process
    showMessage('Creating account...', 'info');
    
    // Simulate API call
    setTimeout(() => {
        // Mock successful registration
        showMessage('Account created successfully! Please login.', 'success');
        
        // Switch to login tab
        setTimeout(() => {
            showLogin();
        }, 1500);
    }, 1000);
}

// Check if user is already logged in
function checkAuthStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
        showMessage('You are already logged in', 'info');
        // In a real app, you would redirect to dashboard
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    
    // Initialize Google Sign-In
    setTimeout(() => {
        initializeGoogleSignIn();
    }, 1000);
    
    // Add input event listeners for real-time validation
    const emailInputs = document.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.value && !validateEmail(this.value)) {
                this.style.borderColor = '#dc3545';
            } else {
                this.style.borderColor = '#e9ecef';
            }
        });
    });
    
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        input.addEventListener('blur', function() {
            if (this.value && !validatePassword(this.value)) {
                this.style.borderColor = '#dc3545';
            } else {
                this.style.borderColor = '#e9ecef';
            }
        });
    });
    
    // Add confirm password validation
    const confirmPasswordInput = document.getElementById('register-confirm-password');
    const passwordInput = document.getElementById('register-password');
    
    if (confirmPasswordInput && passwordInput) {
        confirmPasswordInput.addEventListener('blur', function() {
            if (this.value && this.value !== passwordInput.value) {
                this.style.borderColor = '#dc3545';
                showMessage('Passwords do not match', 'error');
            } else if (this.value) {
                this.style.borderColor = '#28a745';
            }
        });
    }
});

// Logout function (for future use)
function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    showMessage('Logged out successfully', 'success');
    showLogin();
}
