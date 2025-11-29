#!/bin/bash

set -e

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[0;32m"
COLOR_YELLOW="\033[0;33m"
COLOR_RED="\033[0;31m"
COLOR_BLUE="\033[0;34m"

log_info() {
    echo -e "${COLOR_BLUE}[INFO]${COLOR_RESET} $1"
}

log_success() {
    echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $1"
}

log_warning() {
    echo -e "${COLOR_YELLOW}[WARNING]${COLOR_RESET} $1"
}

log_error() {
    echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 is not installed"
        return 1
    fi
    log_success "$1 is installed"
    return 0
}

generate_secret() {
    openssl rand -base64 32
}

echo "╔════════════════════════════════════════╗"
echo "║   HTTP Workbench Setup Script          ║"
echo "╚════════════════════════════════════════╝"
echo ""

log_info "Checking dependencies..."
echo ""

DEPS_OK=true
if ! check_command "docker"; then DEPS_OK=false; fi

if command -v docker-compose &> /dev/null; then
    log_success "docker-compose is installed"
elif docker compose version &> /dev/null; then
    log_success "docker compose is installed"
else
    log_error "docker-compose or docker compose is not installed"
    DEPS_OK=false
fi

if ! check_command "openssl"; then DEPS_OK=false; fi

echo ""

if [ "$DEPS_OK" = false ]; then
    log_error "Missing required dependencies. Please install them first."
    echo ""
    log_info "On Ubuntu, run:"
    echo "  curl -fsSL https://get.docker.com | sh"
    echo ""
    log_warning "After adding your user to the docker group, log out and back in."
    exit 1
fi

log_success "All dependencies are installed!"
echo ""

if [ -f ".env" ]; then
    log_warning ".env file already exists"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Setup cancelled. Using existing .env file."
        exit 0
    fi
fi

log_info "Setting up environment configuration..."
echo ""

read -p "Enter your domain (e.g., httpworkbench.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    log_error "Domain is required"
    exit 1
fi

read -p "Enter Google OAuth Client ID: " GOOGLE_CLIENT_ID
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    log_error "Google Client ID is required"
    exit 1
fi

read -p "Enter Google OAuth Client Secret: " GOOGLE_CLIENT_SECRET
if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    log_error "Google Client Secret is required"
    exit 1
fi

log_info "Generating JWT secret..."
JWT_SECRET=$(generate_secret)

echo ""
log_info "SSL Configuration"
echo "To enable instant SSL for wildcard subdomains (*.instances.$DOMAIN),"
echo "you need a Cloudflare API token with DNS permissions."
echo ""
echo "To get your Cloudflare API token:"
echo "  1. Go to https://dash.cloudflare.com/profile/api-tokens"
echo "  2. Click 'Create Token'"
echo "  3. Use 'Edit zone DNS' template"
echo "  4. Select your zone (domain)"
echo "  5. Copy the token"
echo ""
read -p "Enter your Cloudflare API Token: " CLOUDFLARE_API_TOKEN
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    log_error "Cloudflare API Token is required for wildcard SSL"
    exit 1
fi
echo ""

cat > .env << EOF
DOMAIN=$DOMAIN
FRONTEND_URL=https://$DOMAIN

API_PORT=8081
INSTANCES_PORT=8082

JWT_SECRET=$JWT_SECRET
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN

DATA_DIR=/app/data
EOF

log_success ".env file created successfully!"
echo ""

mkdir -p data
log_success "Data directory created"
echo ""

log_info "Setup complete!"
echo ""
log_info "Next steps:"
echo "  1. Configure DNS (in Cloudflare):"
echo "     - A record: $DOMAIN → Your server IP"
echo "     - A record: *.instances.$DOMAIN → Your server IP"
echo ""
echo "  2. Configure Google OAuth redirect URI:"
echo "     https://$DOMAIN/api/auth/google/callback"
echo ""
echo "  3. Start the application:"
echo "     docker compose up -d"
echo ""
echo "  Note: First startup may take a minute to provision the wildcard SSL certificate."
echo ""
echo "  To update to the latest version:"
echo "     docker compose pull && docker compose up -d"
echo ""
log_success "Happy hacking! 🚀"
