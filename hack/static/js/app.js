/**
 * OpportunityHub - Core JavaScript Application Engine
 * Handles SPA Navigation, Profile Persistence, Filter/Search, Rule-Based Recommendations,
 * Bookmarking, Dashboard Statistics, and Modal Dialogs.
 */

document.addEventListener('DOMContentLoaded', () => {
    // App State Management
    const state = {
        currentView: 'home',
        allOpportunities: [],
        filteredOpportunities: [],
        recommendedOpportunities: [],
        savedOppIds: JSON.parse(localStorage.getItem('opphub_saved_ids') || '[]'),
        userProfile: JSON.parse(localStorage.getItem('opphub_user_profile') || JSON.stringify({
            name: "Aarav Sharma",
            college: "IIT Bombay",
            education_level: "Undergraduate",
            branch: "Computer Science & Engineering",
            year: "3rd Year",
            skills: ["Python", "Java", "Web Development", "AI/ML"],
            interests: ["Artificial Intelligence", "Software Development", "Hackathons"],
            categories: ["Internship", "Hackathon", "Scholarship", "Course"]
        })),
        activeFilters: {
            search: '',
            category: 'all',
            mode: 'all',
            skill: 'all',
            deadline: 'all',
            sort: 'default'
        }
    };

    // DOM Element Cache
    const views = document.querySelectorAll('.view-section');
    const navLinks = document.querySelectorAll('[data-view]');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinksContainer = document.getElementById('navLinks');
    const toastContainer = document.getElementById('toastContainer');
    const modal = document.getElementById('opportunityModal');
    const modalContent = document.getElementById('modalContent');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const savedCountBadge = document.getElementById('savedCountBadge');
    const navProfileName = document.getElementById('navProfileName');

    // --------------------------------------------------------------------------
    // 1. INITIALIZATION & DATA FETCHING
    // --------------------------------------------------------------------------
    async function init() {
        setupNavigation();
        setupProfileForm();
        setupExploreFilters();
        setupHeroSearch();

        await fetchOpportunities();
        updateSavedCountBadge();
        updateProfileNavDisplay();
        calculateRecommendations();
        updateDashboardStats();

        // Check URL hash for direct routing if present
        const hash = window.location.hash.replace('#', '');
        if (hash && document.getElementById(`view-${hash}`)) {
            navigateTo(hash);
        } else {
            navigateTo('home');
        }
    }

    async function fetchOpportunities() {
        try {
            const res = await fetch('/api/opportunities');
            const data = await res.json();
            if (data.success) {
                state.allOpportunities = data.opportunities;
                state.filteredOpportunities = [...data.opportunities];
                renderHomeCategoryCounts();
                renderFeaturedOpportunities();
                renderExploreGrid();
            }
        } catch (err) {
            console.error('Failed to load opportunities:', err);
            showToast('Unable to connect to backend server', 'error');
        }
    }

    // --------------------------------------------------------------------------
    // 2. SPA NAVIGATION ENGINE
    // --------------------------------------------------------------------------
    function setupNavigation() {
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetView = link.getAttribute('data-view');
                if (targetView) {
                    navigateTo(targetView);
                    if (navLinksContainer.classList.contains('open')) {
                        navLinksContainer.classList.remove('open');
                    }
                }
            });
        });

        // Category Cards on Home Page click filter
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const cat = card.getAttribute('data-category');
                state.activeFilters.category = cat;
                document.getElementById('filterCategory').value = cat;
                navigateTo('explore');
                applyFilters();
            });
        });

        // Mobile Menu Toggle
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                navLinksContainer.classList.toggle('open');
            });
        }

        // Modal Close Listener
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeModal);
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }
    }

    function navigateTo(viewName) {
        state.currentView = viewName;
        window.location.hash = viewName;

        views.forEach(v => v.classList.remove('active'));
        const targetSection = document.getElementById(`view-${viewName}`);
        if (targetSection) {
            targetSection.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Update nav active classes
        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-view') === viewName) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Trigger view-specific refreshes
        if (viewName === 'recommended') {
            renderRecommendedView();
        } else if (viewName === 'saved') {
            renderSavedView();
        } else if (viewName === 'dashboard') {
            renderDashboardView();
        } else if (viewName === 'explore') {
            applyFilters();
        }
    }

    // --------------------------------------------------------------------------
    // 3. RULE-BASED MATCH & RECOMMENDATION ENGINE
    // --------------------------------------------------------------------------
    function calculateRecommendations() {
        if (!state.userProfile || !state.allOpportunities.length) return;

        const profile = state.userProfile;
        const userSkills = (profile.skills || []).map(s => s.toLowerCase());
        const userInterests = (profile.interests || []).map(i => i.toLowerCase());
        const userCategories = (profile.categories || []).map(c => c.toLowerCase());
        const userLevel = (profile.education_level || '').toLowerCase();

        state.recommendedOpportunities = state.allOpportunities.map(item => {
            const reqSkills = (item.required_skills || []).map(s => s.toLowerCase());
            const matchedSkills = (item.required_skills || []).filter(s => userSkills.includes(s.toLowerCase()));

            // 1. Skill Score (Max 50 pts)
            let skillScore = 0;
            if (reqSkills.length > 0) {
                skillScore = (matchedSkills.length / reqSkills.length) * 50;
            } else if (userSkills.length > 0) {
                skillScore = 25;
            }

            // 2. Category Preference Score (Max 25 pts)
            let categoryScore = 0;
            if (userCategories.includes((item.category || '').toLowerCase())) {
                categoryScore = 25;
            }

            // 3. Interest & Keyword Score (Max 15 pts)
            let interestScore = 0;
            const fullText = (item.title + ' ' + item.short_description + ' ' + item.category).toLowerCase();
            const matchedInterests = userInterests.filter(int => fullText.includes(int));
            if (userInterests.length > 0) {
                interestScore = Math.min(15, (matchedInterests.length / Math.max(1, userInterests.length)) * 15);
            }

            // 4. Target Level Score (Max 10 pts)
            let levelScore = 0;
            const targetLevels = (item.target_level || []).map(t => t.toLowerCase());
            if (targetLevels.length === 0 || targetLevels.includes(userLevel)) {
                levelScore = 10;
            }

            const rawTotal = Math.round(skillScore + categoryScore + interestScore + levelScore);
            const matchScore = Math.min(98, Math.max((matchedSkills.length > 0 || categoryScore > 0) ? 40 : 15, rawTotal));

            return {
                ...item,
                matchScore,
                matchedSkills
            };
        });

        // Sort descending by match score
        state.recommendedOpportunities.sort((a, b) => b.matchScore - a.matchScore);
    }

    // --------------------------------------------------------------------------
    // 4. HOME & FEATURED VIEW RENDERING
    // --------------------------------------------------------------------------
    function renderHomeCategoryCounts() {
        const counts = {};
        state.allOpportunities.forEach(item => {
            counts[item.category] = (counts[item.category] || 0) + 1;
        });

        const totalElem = document.getElementById('heroTotalCount');
        if (totalElem) totalElem.textContent = `${state.allOpportunities.length}+`;

        Object.keys(counts).forEach(cat => {
            const countElem = document.getElementById(`count-${cat}`);
            if (countElem) {
                countElem.textContent = `${counts[cat]} Openings`;
            }
        });
    }

    function renderFeaturedOpportunities() {
        const grid = document.getElementById('featuredGrid');
        if (!grid) return;

        const featuredItems = state.allOpportunities.filter(item => item.featured).slice(0, 3);
        grid.innerHTML = '';
        featuredItems.forEach(item => {
            grid.appendChild(createOpportunityCard(item, { showFeaturedBadge: true }));
        });
    }

    // --------------------------------------------------------------------------
    // 5. EXPLORE VIEW & FILTERS
    // --------------------------------------------------------------------------
    function setupHeroSearch() {
        const heroInput = document.getElementById('heroSearchInput');
        const heroBtn = document.getElementById('heroSearchBtn');

        const handleHeroSearch = () => {
            const q = heroInput.value.trim();
            if (q) {
                state.activeFilters.search = q;
                document.getElementById('exploreSearchInput').value = q;
                navigateTo('explore');
            }
        };

        if (heroBtn) heroBtn.addEventListener('click', handleHeroSearch);
        if (heroInput) {
            heroInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleHeroSearch();
            });
        }
    }

    function setupExploreFilters() {
        const exploreSearchInput = document.getElementById('exploreSearchInput');
        const filterCategory = document.getElementById('filterCategory');
        const filterMode = document.getElementById('filterMode');
        const filterSkill = document.getElementById('filterSkill');
        const filterDeadline = document.getElementById('filterDeadline');
        const filterSort = document.getElementById('filterSort');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const resetFiltersBtn = document.getElementById('resetFiltersBtn');
        const emptyResetBtn = document.getElementById('emptyResetBtn');

        exploreSearchInput.addEventListener('input', (e) => {
            state.activeFilters.search = e.target.value.trim();
            applyFilters();
        });

        filterCategory.addEventListener('change', (e) => {
            state.activeFilters.category = e.target.value;
            applyFilters();
        });

        filterMode.addEventListener('change', (e) => {
            state.activeFilters.mode = e.target.value;
            applyFilters();
        });

        filterSkill.addEventListener('change', (e) => {
            state.activeFilters.skill = e.target.value;
            applyFilters();
        });

        filterDeadline.addEventListener('change', (e) => {
            state.activeFilters.deadline = e.target.value;
            applyFilters();
        });

        filterSort.addEventListener('change', (e) => {
            state.activeFilters.sort = e.target.value;
            applyFilters();
        });

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                exploreSearchInput.value = '';
                state.activeFilters.search = '';
                applyFilters();
            });
        }

        const resetAll = () => {
            state.activeFilters = {
                search: '',
                category: 'all',
                mode: 'all',
                skill: 'all',
                deadline: 'all',
                sort: 'default'
            };
            exploreSearchInput.value = '';
            filterCategory.value = 'all';
            filterMode.value = 'all';
            filterSkill.value = 'all';
            filterDeadline.value = 'all';
            filterSort.value = 'default';
            applyFilters();
        };

        if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetAll);
        if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetAll);
    }

    function applyFilters() {
        const { search, category, mode, skill, deadline, sort } = state.activeFilters;
        const today = new Date();

        let list = state.allOpportunities.filter(item => {
            // Search Query
            if (search) {
                const s = search.toLowerCase();
                const titleMatch = item.title.toLowerCase().includes(s);
                const orgMatch = item.organization.toLowerCase().includes(s);
                const descMatch = (item.short_description || '').toLowerCase().includes(s);
                const skillMatch = (item.required_skills || []).some(sk => sk.toLowerCase().includes(s));
                if (!titleMatch && !orgMatch && !descMatch && !skillMatch) return false;
            }

            // Category Filter
            if (category !== 'all') {
                if (item.category.toLowerCase() !== category.toLowerCase()) return false;
            }

            // Mode Filter
            if (mode !== 'all') {
                if (item.mode.toLowerCase() !== mode.toLowerCase()) return false;
            }

            // Skill Filter
            if (skill !== 'all') {
                const itemSkills = (item.required_skills || []).map(sk => sk.toLowerCase());
                if (!itemSkills.includes(skill.toLowerCase())) return false;
            }

            // Deadline Filter
            if (deadline !== 'all') {
                if (deadline === 'no_deadline') {
                    if (item.deadline && item.deadline !== 'No Deadline') return false;
                } else if (item.deadline && item.deadline !== 'No Deadline') {
                    const dlDate = new Date(item.deadline);
                    const daysLeft = Math.ceil((dlDate - today) / (1000 * 60 * 60 * 24));
                    if (deadline === 'ending_soon' && !(daysLeft >= 0 && daysLeft <= 14)) return false;
                    if (deadline === 'this_month' && !(daysLeft >= 0 && daysLeft <= 30)) return false;
                }
            }

            return true;
        });

        // Apply Sorting
        if (sort === 'deadline') {
            list.sort((a, b) => {
                if (a.deadline === 'No Deadline') return 1;
                if (b.deadline === 'No Deadline') return -1;
                return new Date(a.deadline) - new Date(b.deadline);
            });
        } else if (sort === 'match') {
            calculateRecommendations();
            const matchMap = {};
            state.recommendedOpportunities.forEach(rec => matchMap[rec.id] = rec.matchScore);
            list.sort((a, b) => (matchMap[b.id] || 0) - (matchMap[a.id] || 0));
        } else if (sort === 'title') {
            list.sort((a, b) => a.title.localeCompare(b.title));
        }

        state.filteredOpportunities = list;
        renderExploreGrid();
    }

    function renderExploreGrid() {
        const grid = document.getElementById('exploreGrid');
        const emptyState = document.getElementById('exploreEmptyState');
        const countLabel = document.getElementById('resultsCount');

        if (!grid) return;

        countLabel.textContent = `Showing ${state.filteredOpportunities.length} of ${state.allOpportunities.length} opportunities`;

        if (state.filteredOpportunities.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            grid.style.display = 'grid';
            emptyState.style.display = 'none';
            grid.innerHTML = '';
            state.filteredOpportunities.forEach(item => {
                grid.appendChild(createOpportunityCard(item));
            });
        }
    }

    // --------------------------------------------------------------------------
    // 6. RECOMMENDED VIEW RENDERING
    // --------------------------------------------------------------------------
    function renderRecommendedView() {
        calculateRecommendations();
        const grid = document.getElementById('recommendedGrid');
        const emptyNotice = document.getElementById('recEmptyProfileNotice');
        const bannerName = document.getElementById('recProfileName');
        const bannerMeta = document.getElementById('recProfileMeta');
        const bannerAvatar = document.getElementById('recAvatar');
        const bannerTags = document.getElementById('recProfileTags');

        if (!grid) return;

        const prof = state.userProfile;
        if (!prof || !prof.name) {
            emptyNotice.style.display = 'flex';
        } else {
            emptyNotice.style.display = 'none';
            bannerName.textContent = prof.name;
            bannerMeta.textContent = `${prof.college || 'College'} • ${prof.education_level || ''} • ${prof.branch || ''} (${prof.year || ''})`;
            bannerAvatar.textContent = prof.name.substring(0, 2).toUpperCase();

            bannerTags.innerHTML = '';
            (prof.skills || []).forEach(sk => {
                const tag = document.createElement('span');
                tag.className = 'skill-tag matched';
                tag.textContent = `✓ ${sk}`;
                bannerTags.appendChild(tag);
            });
        }

        grid.innerHTML = '';
        state.recommendedOpportunities.forEach(item => {
            grid.appendChild(createOpportunityCard(item, { showMatchBadge: true }));
        });
    }

    // --------------------------------------------------------------------------
    // 7. SAVED VIEW RENDERING
    // --------------------------------------------------------------------------
    function renderSavedView() {
        const grid = document.getElementById('savedGrid');
        const emptyState = document.getElementById('savedEmptyState');

        if (!grid) return;

        const savedItems = state.allOpportunities.filter(item => state.savedOppIds.includes(item.id));

        if (savedItems.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            grid.style.display = 'grid';
            emptyState.style.display = 'none';
            grid.innerHTML = '';
            savedItems.forEach(item => {
                grid.appendChild(createOpportunityCard(item));
            });
        }
    }

    // --------------------------------------------------------------------------
    // 8. DASHBOARD VIEW RENDERING
    // --------------------------------------------------------------------------
    function renderDashboardView() {
        calculateRecommendations();
        updateDashboardStats();

        const welcomeHeading = document.getElementById('dashWelcomeHeading');
        if (welcomeHeading && state.userProfile.name) {
            welcomeHeading.textContent = `Welcome back, ${state.userProfile.name} 👋`;
        }

        // Deadline List
        const deadlineContainer = document.getElementById('dashDeadlineList');
        if (deadlineContainer) {
            deadlineContainer.innerHTML = '';
            const today = new Date();
            const upcoming = state.allOpportunities
                .filter(item => item.deadline && item.deadline !== 'No Deadline')
                .map(item => {
                    const dlDate = new Date(item.deadline);
                    const daysLeft = Math.ceil((dlDate - today) / (1000 * 60 * 60 * 24));
                    return { ...item, daysLeft };
                })
                .filter(item => item.daysLeft >= 0)
                .sort((a, b) => a.daysLeft - b.daysLeft)
                .slice(0, 4);

            upcoming.forEach(item => {
                const el = document.createElement('div');
                el.className = 'deadline-item';
                el.innerHTML = `
                    <div class="deadline-item-info">
                        <h4>${item.title}</h4>
                        <p>${item.organization} • Deadline: ${item.deadline_display}</p>
                    </div>
                    <div class="deadline-urgent">${item.daysLeft} days left</div>
                `;
                el.addEventListener('click', () => openModal(item));
                deadlineContainer.appendChild(el);
            });
        }

        // Mini Recommended List
        const recContainer = document.getElementById('dashRecList');
        if (recContainer) {
            recContainer.innerHTML = '';
            const topRecs = state.recommendedOpportunities.slice(0, 3);
            topRecs.forEach(item => {
                recContainer.appendChild(createOpportunityCard(item, { showMatchBadge: true }));
            });
        }
    }

    function updateDashboardStats() {
        const totalElem = document.getElementById('dashTotalFound');
        const savedElem = document.getElementById('dashSavedCount');
        const recElem = document.getElementById('dashRecCount');
        const deadlineElem = document.getElementById('dashDeadlinesCount');

        if (totalElem) totalElem.textContent = state.allOpportunities.length;
        if (savedElem) savedElem.textContent = state.savedOppIds.length;

        if (recElem) {
            const highMatches = state.recommendedOpportunities.filter(item => item.matchScore >= 50);
            recElem.textContent = highMatches.length;
        }

        if (deadlineElem) {
            const today = new Date();
            const urgent = state.allOpportunities.filter(item => {
                if (!item.deadline || item.deadline === 'No Deadline') return false;
                const dlDate = new Date(item.deadline);
                const daysLeft = Math.ceil((dlDate - today) / (1000 * 60 * 60 * 24));
                return daysLeft >= 0 && daysLeft <= 10;
            });
            deadlineElem.textContent = urgent.length;
        }
    }

    // --------------------------------------------------------------------------
    // 9. OPPORTUNITY CARD COMPONENT CREATOR
    // --------------------------------------------------------------------------
    function createOpportunityCard(item, options = {}) {
        const card = document.createElement('div');
        card.className = `opp-card ${item.featured ? 'opp-card-featured' : ''}`;

        const isSaved = state.savedOppIds.includes(item.id);
        const userSkills = (state.userProfile.skills || []).map(s => s.toLowerCase());

        // Calculate days left
        let deadlineBadgeHtml = '';
        if (item.deadline && item.deadline !== 'No Deadline') {
            const dlDate = new Date(item.deadline);
            const daysLeft = Math.ceil((dlDate - new Date()) / (1000 * 60 * 60 * 24));
            if (daysLeft >= 0 && daysLeft <= 14) {
                deadlineBadgeHtml = `<span class="deadline-urgent">🔥 ${daysLeft} days left</span>`;
            } else {
                deadlineBadgeHtml = `<span>📅 ${item.deadline_display}</span>`;
            }
        } else {
            deadlineBadgeHtml = `<span>♾️ ${item.deadline_display}</span>`;
        }

        // Match Badge
        let matchBadgeHtml = '';
        if (options.showMatchBadge && item.matchScore) {
            matchBadgeHtml = `<span class="badge-match">✨ ${item.matchScore}% Match</span>`;
        } else if (options.showFeaturedBadge && item.featured) {
            matchBadgeHtml = `<span class="badge-yellow">⭐ Featured</span>`;
        }

        // Skills HTML
        const skillsHtml = (item.required_skills || []).map(sk => {
            const isMatched = userSkills.includes(sk.toLowerCase());
            return `<span class="skill-tag ${isMatched ? 'matched' : ''}">${isMatched ? '✓ ' : ''}${sk}</span>`;
        }).join('');

        card.innerHTML = `
            <div class="opp-card-header">
                <div class="opp-badges">
                    <span class="badge-green">${item.category}</span>
                    <span class="mode-badge">${item.mode}</span>
                    ${matchBadgeHtml}
                </div>
                <button class="btn-bookmark ${isSaved ? 'saved' : ''}" title="${isSaved ? 'Remove bookmark' : 'Bookmark opportunity'}">
                    ${isSaved ? '🔖' : '📑'}
                </button>
            </div>

            <div class="opp-title-row">
                <div class="org-avatar">${item.org_logo || 'OP'}</div>
                <div class="opp-title-info">
                    <h3>${item.title}</h3>
                    <span class="opp-org-name">${item.organization}</span>
                </div>
            </div>

            <p class="opp-description">${item.short_description}</p>

            <div class="opp-skills-row">
                ${skillsHtml}
            </div>

            <div class="opp-card-footer">
                <div class="deadline-text">
                    ${deadlineBadgeHtml}
                </div>
                <button class="btn btn-outline btn-sm btn-details">View Details</button>
            </div>
        `;

        // Event Listeners
        const bookmarkBtn = card.querySelector('.btn-bookmark');
        bookmarkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBookmark(item.id);
        });

        const detailsBtn = card.querySelector('.btn-details');
        detailsBtn.addEventListener('click', () => openModal(item));

        return card;
    }

    // --------------------------------------------------------------------------
    // 10. BOOKMARK & PROFILE PERSISTENCE
    // --------------------------------------------------------------------------
    function toggleBookmark(oppId) {
        if (state.savedOppIds.includes(oppId)) {
            state.savedOppIds = state.savedOppIds.filter(id => id !== oppId);
            showToast('Opportunity removed from saved bookmarks', 'info');
        } else {
            state.savedOppIds.push(oppId);
            showToast('Opportunity saved to bookmarks! 🔖', 'success');
        }

        localStorage.setItem('opphub_saved_ids', JSON.stringify(state.savedOppIds));
        updateSavedCountBadge();
        updateDashboardStats();

        // Refresh currently active views
        if (state.currentView === 'saved') renderSavedView();
        if (state.currentView === 'explore') renderExploreGrid();
        if (state.currentView === 'recommended') renderRecommendedView();
        if (state.currentView === 'home') renderFeaturedOpportunities();
    }

    function updateSavedCountBadge() {
        if (savedCountBadge) {
            savedCountBadge.textContent = state.savedOppIds.length;
        }
    }

    function updateProfileNavDisplay() {
        if (navProfileName && state.userProfile.name) {
            navProfileName.textContent = state.userProfile.name.split(' ')[0];
        }
    }

    function setupProfileForm() {
        const form = document.getElementById('profileForm');
        if (!form) return;

        // Populate existing values
        const prof = state.userProfile;
        document.getElementById('profName').value = prof.name || '';
        document.getElementById('profCollege').value = prof.college || '';
        document.getElementById('profLevel').value = prof.education_level || 'Undergraduate';
        document.getElementById('profBranch').value = prof.branch || '';
        document.getElementById('profYear').value = prof.year || '3rd Year';

        // Skills Tag Chips Click Handler
        const skillChips = document.querySelectorAll('#skillsTagSelector .tag-chip');
        skillChips.forEach(chip => {
            const skillVal = chip.getAttribute('data-skill');
            if (prof.skills && prof.skills.includes(skillVal)) {
                chip.classList.add('selected');
            }
            chip.addEventListener('click', () => {
                chip.classList.toggle('selected');
            });
        });

        // Interests Tag Chips Click Handler
        const interestChips = document.querySelectorAll('#interestsTagSelector .tag-chip');
        interestChips.forEach(chip => {
            const intVal = chip.getAttribute('data-interest');
            if (prof.interests && prof.interests.includes(intVal)) {
                chip.classList.add('selected');
            }
            chip.addEventListener('click', () => {
                chip.classList.toggle('selected');
            });
        });

        // Preferred Categories Checkboxes
        const categoryCheckboxes = document.querySelectorAll('input[name="prefCategory"]');
        categoryCheckboxes.forEach(cb => {
            cb.checked = prof.categories && prof.categories.includes(cb.value);
        });

        // Form Submit
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            // Gather selected skills
            const selectedSkills = [];
            document.querySelectorAll('#skillsTagSelector .tag-chip.selected').forEach(c => {
                selectedSkills.push(c.getAttribute('data-skill'));
            });

            // Gather selected interests
            const selectedInterests = [];
            document.querySelectorAll('#interestsTagSelector .tag-chip.selected').forEach(c => {
                selectedInterests.push(c.getAttribute('data-interest'));
            });

            // Gather selected categories
            const selectedCategories = [];
            document.querySelectorAll('input[name="prefCategory"]:checked').forEach(c => {
                selectedCategories.push(c.value);
            });

            state.userProfile = {
                name: document.getElementById('profName').value.trim(),
                college: document.getElementById('profCollege').value.trim(),
                education_level: document.getElementById('profLevel').value,
                branch: document.getElementById('profBranch').value.trim(),
                year: document.getElementById('profYear').value,
                skills: selectedSkills,
                interests: selectedInterests,
                categories: selectedCategories
            };

            localStorage.setItem('opphub_user_profile', JSON.stringify(state.userProfile));

            updateProfileNavDisplay();
            calculateRecommendations();
            showToast('Student profile saved! Recommendation scores updated ✨', 'success');

            // Redirect to recommendations
            navigateTo('recommended');
        });
    }

    // --------------------------------------------------------------------------
    // 11. DETAILS MODAL & EXTERNAL APPLICATION LINK
    // --------------------------------------------------------------------------
    function openModal(item) {
        if (!modal || !modalContent) return;

        const isSaved = state.savedOppIds.includes(item.id);
        const userSkills = (state.userProfile.skills || []).map(s => s.toLowerCase());

        const skillsPills = (item.required_skills || []).map(sk => {
            const isMatched = userSkills.includes(sk.toLowerCase());
            return `<span class="skill-tag ${isMatched ? 'matched' : ''}">${isMatched ? '✓ ' : ''}${sk}</span>`;
        }).join('');

        modalContent.innerHTML = `
            <div class="modal-header-section">
                <div class="org-avatar">${item.org_logo || 'OP'}</div>
                <div class="modal-title-info">
                    <h2>${item.title}</h2>
                    <p style="color: var(--text-muted); font-weight: 600;">${item.organization}</p>
                </div>
            </div>

            <div class="modal-facts-grid">
                <div class="fact-item">
                    <span class="fact-label">Category</span>
                    <span class="fact-value">${item.category}</span>
                </div>
                <div class="fact-item">
                    <span class="fact-label">Mode</span>
                    <span class="fact-value">${item.mode}</span>
                </div>
                <div class="fact-item">
                    <span class="fact-label">Location</span>
                    <span class="fact-value">${item.location || 'Remote'}</span>
                </div>
                <div class="fact-item">
                    <span class="fact-label">Deadline</span>
                    <span class="fact-value">${item.deadline_display}</span>
                </div>
            </div>

            <div class="modal-section">
                <h4>Description & Impact</h4>
                <p>${item.description}</p>
            </div>

            <div class="modal-section">
                <h4>Eligibility Requirements</h4>
                <p>${item.eligibility || 'Open to all enrolled students.'}</p>
            </div>

            <div class="modal-section">
                <h4>Stipend / Prize Pool</h4>
                <p style="font-weight: 700; color: var(--primary-green);">${item.stipend_or_prize || 'Standard Student Benefits'}</p>
            </div>

            <div class="modal-section">
                <h4>Required Skills</h4>
                <div class="opp-skills-row" style="margin-top: 0.5rem;">
                    ${skillsPills}
                </div>
            </div>

            <div class="modal-actions">
                <a href="${item.apply_url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-lg btn-apply-now">
                    🚀 Apply Now (Official Website)
                </a>
                <button class="btn btn-outline modal-bookmark-btn">
                    ${isSaved ? '🔖 Saved' : '📑 Save Opportunity'}
                </button>
            </div>
        `;

        // Event listener for apply now toast
        const applyBtn = modalContent.querySelector('.btn-apply-now');
        applyBtn.addEventListener('click', () => {
            showToast(`Opening official link for ${item.organization}... 🚀`, 'info');
        });

        // Event listener for bookmark in modal
        const modalBmBtn = modalContent.querySelector('.modal-bookmark-btn');
        modalBmBtn.addEventListener('click', () => {
            toggleBookmark(item.id);
            openModal(item); // Refresh modal state
        });

        modal.style.display = 'flex';
    }

    function closeModal() {
        if (modal) modal.style.display = 'none';
    }

    // --------------------------------------------------------------------------
    // 12. TOAST NOTIFICATION UTILITY
    // --------------------------------------------------------------------------
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // Run Initialization
    init();
});
