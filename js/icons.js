/**
 * Vector Logos & Icon Library for GourmetFlow
 * Replaces all emojis with crisp, professional SVG icons.
 */

const ICONS = {
  // Brand Logo for GourmetFlow
  logo: `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
      <line x1="6" y1="1" x2="6" y2="4"></line>
      <line x1="10" y1="1" x2="10" y2="4"></line>
      <line x1="14" y1="1" x2="14" y2="4"></line>
    </svg>
  `,

  // Official Bizum Logo (Stylized vector)
  bizum: `
    <svg width="68" height="22" viewBox="0 0 110 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="110" height="32" rx="6" fill="#00AA9E" fill-opacity="0.15"/>
      <path d="M16 11C16 9.34315 17.3431 8 19 8H23C25.2091 8 27 9.79086 27 12C27 13.386 26.2978 14.6074 25.2285 15.318C26.6853 16.0371 27.6875 17.5491 27.6875 19.2969C27.6875 21.8943 25.5818 24 22.9844 24H19C17.3431 24 16 22.6569 16 21V11Z" fill="#00C4B4"/>
      <text x="36" y="21" font-family="'DM Sans', sans-serif" font-size="16" font-weight="800" fill="#00D2C2" letter-spacing="-0.5">bizum</text>
    </svg>
  `,

  // Official PayPal Logo (Vector)
  paypal: `
    <svg width="68" height="22" viewBox="0 0 100 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="28" rx="6" fill="#0079C1" fill-opacity="0.15"/>
      <path d="M18.5 7H14.2C13.8 7 13.5 7.3 13.4 7.7L11.2 21.2C11.1 21.5 11.4 21.8 11.7 21.8H14.1C14.5 21.8 14.8 21.5 14.9 21.1L15.5 17.5C15.6 17.1 15.9 16.8 16.3 16.8H17.8C20.6 16.8 22.4 15.4 22.8 12.6C23 11.4 22.7 10.3 22 9.5C21.2 8.7 19.9 8.2 18.5 7Z" fill="#00457C"/>
      <path d="M21.5 10H17.2C16.8 10 16.5 10.3 16.4 10.7L14.2 24.2C14.1 24.5 14.4 24.8 14.7 24.8H17.1C17.5 24.8 17.8 24.5 17.9 24.1L18.5 20.5C18.6 20.1 18.9 19.8 19.3 19.8H20.8C23.6 19.8 25.4 18.4 25.8 15.6C26.3 12.7 24.5 10 21.5 10Z" fill="#0079C1"/>
      <text x="32" y="19" font-family="'DM Sans', sans-serif" font-size="14" font-weight="800" fill="#38BDF8">PayPal</text>
    </svg>
  `,

  // Credit / Debit Card Icon
  card: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3"></rect>
      <line x1="2" y1="10" x2="22" y2="10"></line>
      <line x1="6" y1="15" x2="9" y2="15"></line>
      <line x1="12" y1="15" x2="14" y2="15"></line>
    </svg>
  `,

  // Chat / Message Bubble
  chat: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `,

  // Shopping Bag / Cart
  cart: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
  `,

  // Pin / Location
  location: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3"></circle>
    </svg>
  `,

  // Delivery Vehicle / Moto
  delivery: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18.5" cy="17.5" r="3.5"></circle>
      <circle cx="5.5" cy="17.5" r="3.5"></circle>
      <path d="M15 6h-5a2 2 0 0 0-2 2v7h11l-2-6a2 2 0 0 0-2-3z"></path>
      <path d="M2 13h4"></path>
    </svg>
  `,

  // Table / Dine In
  table: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 18v3"></path>
      <path d="M20 18v3"></path>
      <path d="M4 14h16"></path>
      <path d="M3 10h18"></path>
      <path d="M5 6h14"></path>
      <path d="M4 10v4"></path>
      <path d="M20 10v4"></path>
    </svg>
  `,

  // Chef / Kitchen Cook
  chef: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 18h12v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3z"></path>
      <path d="M6 14v4h12v-4"></path>
      <path d="M5 14a4 4 0 0 1 2.5-7.5 4.5 4.5 0 0 1 9 0A4 4 0 0 1 19 14z"></path>
    </svg>
  `,

  // Shield / Admin
  admin: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      <circle cx="12" cy="11" r="3"></circle>
    </svg>
  `,

  // Lock / Security
  lock: `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  `,

  // Bell / Alert
  bell: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
  `,

  // Checkmark
  check: `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `,

  // Clock
  clock: `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  `,

  // Trend Up / Metrics
  trending: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
      <polyline points="17 6 23 6 23 12"></polyline>
    </svg>
  `,

  // Euro / Revenue Currency
  revenue: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"></line>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
    </svg>
  `,

  // Orders / Receipt / KDS
  orders: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  `,

  // Building / Store / Tenant
  building: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
      <line x1="9" y1="22" x2="9" y2="16"></line>
      <line x1="15" y1="22" x2="15" y2="16"></line>
      <line x1="9" y1="6" x2="9" y2="6.01"></line>
      <line x1="15" y1="6" x2="15" y2="6.01"></line>
      <line x1="9" y1="10" x2="9" y2="10.01"></line>
      <line x1="15" y1="10" x2="15" y2="10.01"></line>
    </svg>
  `,

  // Flame / Cooking
  flame: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"></path>
    </svg>
  `,

  // Arrow Right
  arrowRight: `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  `,

  // Refresh
  refresh: `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>
  `,

  // Star / Popular
  star: `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  `
};

window.ICONS = ICONS;
