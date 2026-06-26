const obsidian = require('obsidian');

const VIEW_TYPE_TAG_INTERSECTION = "tag-intersection-view";

/**
 * Generates a stable and deterministic Hue (0-360) based on the tag name
 */
function getTagHue(tag) {
    let hash = 0;
    const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
    for (let i = 0; i < cleanTag.length; i++) {
        hash = cleanTag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
}

class TagIntersectionView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.fileIndex = [];
        this.selectedTags = new Set();
        this.excludedTags = new Set();
        this.searchQuery = "";
        this.hideEmptyTags = false;
        this.sortOrder = "mtime-desc";
    }

    getViewType() {
        return VIEW_TYPE_TAG_INTERSECTION;
    }

    getDisplayText() {
        return "Intersecção de Tags";
    }

    getIcon() {
        return "hash";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("tag-intersection-container");

        this.renderLayout(container);
        this.refreshDataAndUI();
    }

    async onClose() {
        this.selectedTags.clear();
    }

    refreshDataAndUI() {
        this.buildFileIndex();
        this.updateUI();
    }

    buildFileIndex() {
        const files = this.app.vault.getMarkdownFiles();
        this.fileIndex = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            const tagsArray = obsidian.getAllTags(cache);
            const tagsSet = new Set();

            if (tagsArray) {
                for (const t of tagsArray) {
                    tagsSet.add(t.toLowerCase());
                }
            }

            this.fileIndex.push({
                file: file,
                tags: tagsSet,
                mtime: file.stat.mtime,
                ctime: file.stat.ctime
            });
        }
    }

    renderLayout(parent) {
        // Main container
        const container = parent.createDiv({ cls: "tag-intersection-container" });

        // Header
        const header = container.createDiv({ cls: "tag-intersection-header" });
        header.createEl("h4", { text: "Intersecção de Tags", cls: "tag-intersection-title" });
        header.createEl("p", { text: "Selecione tags para filtrar notas que contêm todas elas.", cls: "tag-intersection-subtitle" });

        // Search Box
        const searchWrapper = container.createDiv({ cls: "tag-intersection-search-wrapper" });
        const iconSpan = searchWrapper.createSpan({ cls: "tag-intersection-search-icon" });
        iconSpan.innerHTML = `🔎`;
        this.searchInputEl = searchWrapper.createEl("input", { type: "text", placeholder: "Pesquisar tags...", cls: "tag-intersection-search-input" });
        this.searchInputEl.addEventListener("input", (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.updateUI();
        });

        // Active Tags
        const activeSection = container.createDiv({ cls: "tag-intersection-active-section" });
        const activeHeader = activeSection.createDiv({ cls: "tag-intersection-active-header" });
        activeHeader.createSpan({ text: "Filtros Ativos" });
        const clearBtn = activeHeader.createEl("button", { text: "Limpar", cls: "tag-intersection-clear-btn" });
        clearBtn.addEventListener("click", () => {
            this.selectedTags.clear();
            this.excludedTags.clear();
            this.updateUI();
        });
        this.activeTagsContainer = activeSection.createDiv({ cls: "tag-intersection-active-tags" });

        // Suggested Tags
        this.suggestedSectionEl = container.createDiv({ cls: "tag-intersection-suggested-section" });
        this.suggestedSectionEl.createEl("h5", { text: "Sugestões", cls: "tag-intersection-section-title" });
        this.suggestedTagsContainer = this.suggestedSectionEl.createDiv({ cls: "tag-suggested-tags" });

        // Excluded Tags
        const excludedSection = container.createDiv({ cls: "tag-intersection-excluded-section" });
        const excludedHeader = excludedSection.createDiv({ cls: "tag-intersection-excluded-header" });
        excludedHeader.createSpan({ text: "Filtros Negativos" });
        const clearExclBtn = excludedHeader.createEl("button", { text: "Limpar", cls: "tag-intersection-clear-btn" });
        clearExclBtn.addEventListener("click", () => {
            this.excludedTags.clear();
            this.updateUI();
        });
        this.excludedTagsContainer = excludedSection.createDiv({ cls: "tag-excluded-tags" });
        this.excludedInputEl = excludedSection.createEl("input", { type: "text", placeholder: "Adicionar tags negativas...", cls: "tag-intersection-excluded-input" });
        this.excludedInputEl.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                const raw = this.excludedInputEl.value.trim();
                if (raw) {
                    const tags = raw.split(/\s+/).map(t => t.replace(/^#/, ""));
                    tags.forEach(t => this.excludedTags.add(t));
                    this.excludedInputEl.value = "";
                    this.updateUI();
                }
            }
        });

        // Tag List Section
        const tagsSection = container.createDiv({ cls: "tag-intersection-section" });
        const tagsHeaderWrapper = tagsSection.createDiv({ cls: "tag-intersection-section-title-wrapper" });
        tagsHeaderWrapper.createEl("h5", { text: "Tags Disponíveis", cls: "tag-intersection-section-title" });
        const toggleLabel = tagsHeaderWrapper.createEl("label", { cls: "tag-intersection-toggle-label" });
        this.hideEmptyToggleEl = toggleLabel.createEl("input", { type: "checkbox", cls: "tag-intersection-toggle-input" });
        toggleLabel.createSpan({ text: "Ocultar vazias" });
        this.hideEmptyToggleEl.addEventListener("change", (e) => {
            this.hideEmptyTags = e.target.checked;
            this.updateUI();
        });
        this.tagListContainer = tagsSection.createDiv({ cls: "tag-list-container" });

        // Notes Section
        const notesSection = container.createDiv({ cls: "tag-intersection-notes-section" });
        const notesHeaderWrapper = notesSection.createDiv({ cls: "tag-intersection-section-title-wrapper" });
        this.notesCountEl = notesHeaderWrapper.createEl("h5", { text: "Notas (0)", cls: "tag-intersection-section-title" });
        const copyBtn = notesHeaderWrapper.createEl("button", { text: "Copiar Consulta", cls: "tag-intersection-copy-btn" });
        copyBtn.addEventListener("click", () => {
            const include = Array.from(this.selectedTags).map(t => `#${t.replace(/^#/, '')}`).join(' AND ');
            const exclude = Array.from(this.excludedTags).map(t => `-#${t.replace(/^#/, '')}`).join(' ');
            const query = [include, exclude].filter(Boolean).join(' AND ');
            navigator.clipboard.writeText(query);
        });
        this.sortSelectEl = notesHeaderWrapper.createEl("select", { cls: "notes-sort-select" });
        this.sortSelectEl.createEl("option", { value: "mtime-desc", text: "Modificação (Novo-Antigo)" });
        this.sortSelectEl.createEl("option", { value: "mtime-asc", text: "Modificação (Antigo-Novo)" });
        this.sortSelectEl.createEl("option", { value: "ctime-desc", text: "Criação (Novo-Antigo)" });
        this.sortSelectEl.createEl("option", { value: "ctime-asc", text: "Criação (Antigo-Novo)" });
        this.sortSelectEl.createEl("option", { value: "title-asc", text: "Título (A-Z)" });
        this.sortSelectEl.createEl("option", { value: "title-desc", text: "Título (Z-A)" });
        this.sortSelectEl.addEventListener("change", (e) => {
            this.sortOrder = e.target.value;
            this.updateUI();
        });
        this.notesListContainer = notesSection.createDiv({ cls: "notes-list-container" });
    }

    updateUI() {
        const matchingFiles = this.fileIndex.filter(item => {
            const matchesInclude = Array.from(this.selectedTags).every(tag => item.tags.has(tag));
            const matchesExclude = Array.from(this.excludedTags).every(tag => !item.tags.has(tag));
            return matchesInclude && matchesExclude;
        });

        this.renderActiveTags();
        this.renderExcludedTags();

        const tagCounts = new Map();
        for (const item of matchingFiles) {
            for (const tag of item.tags) {
                if (this.selectedTags.has(tag)) continue;
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }

        this.renderSuggestedTags(matchingFiles, tagCounts);

        const allUniqueTags = new Set();
        for (const item of this.fileIndex) {
            for (const tag of item.tags) {
                if (!this.selectedTags.has(tag)) {
                    allUniqueTags.add(tag);
                }
            }
        }

        this.renderTagList(allUniqueTags, tagCounts);
        this.renderNotesList(matchingFiles);
    }

    renderActiveTags() {
        this.activeTagsContainer.empty();

        if (this.selectedTags.size === 0) {
            this.activeTagsContainer.createDiv({
                text: "Nenhuma tag selecionada",
                cls: "tag-active-empty"
            });
            return;
        }

        for (const tag of this.selectedTags) {
            const chip = this.activeTagsContainer.createDiv({ cls: "tag-active-chip" });
            const hue = getTagHue(tag);
            chip.style.setProperty('--tag-hue', hue.toString());

            chip.createSpan({ text: tag });

            const removeIcon = chip.createSpan({ text: "×", cls: "tag-active-chip-remove" });
            removeIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                this.selectedTags.delete(tag);
                this.updateUI();
            });
        }
    }

    renderExcludedTags() {
        this.excludedTagsContainer.empty();
        if (this.excludedTags.size === 0) {
            this.excludedTagsContainer.createDiv({ text: "Nenhum filtro negativo", cls: "tag-excluded-empty" });
            return;
        }
        for (const tag of this.excludedTags) {
            const chip = this.excludedTagsContainer.createDiv({ cls: "tag-excluded-chip" });
            const hue = getTagHue(tag);
            chip.style.setProperty('--tag-hue', hue.toString());
            chip.createSpan({ text: `-#${tag}` });
            const removeIcon = chip.createSpan({ text: "×", cls: "tag-excluded-chip-remove" });
            removeIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                this.excludedTags.delete(tag);
                this.updateUI();
            });
        }
    }

    renderSuggestedTags(matchingFiles, tagCounts) {
        this.suggestedTagsContainer.empty();

        if (this.selectedTags.size === 0 || matchingFiles.length === 0) {
            this.suggestedSectionEl.style.display = "none";
            return;
        }

        const totalMatchingFiles = matchingFiles.length;
        const suggestions = [];

        for (const [tag, count] of tagCounts.entries()) {
            const percentage = Math.round((count / totalMatchingFiles) * 100);
            if (percentage >= 15) {
                suggestions.push({ tag, count, percentage });
            }
        }

        suggestions.sort((a, b) => {
            if (b.percentage !== a.percentage) {
                return b.percentage - a.percentage;
            }
            return a.tag.localeCompare(b.tag);
        });

        const topSuggestions = suggestions.slice(0, 5);

        if (topSuggestions.length === 0) {
            this.suggestedSectionEl.style.display = "none";
            return;
        }

        this.suggestedSectionEl.style.display = "block";

        for (const item of topSuggestions) {
            const chip = this.suggestedTagsContainer.createEl("button", { cls: "tag-suggested-chip" });
            const hue = getTagHue(item.tag);
            chip.style.setProperty('--tag-hue', hue.toString());

            chip.createSpan({ text: "✨ ", cls: "tag-suggested-icon" });
            chip.createSpan({ text: item.tag, cls: "tag-suggested-name" });
            chip.createSpan({ text: `${item.percentage}%`, cls: "tag-suggested-percent" });

            chip.addEventListener("click", () => {
                this.selectedTags.add(item.tag);
                this.updateUI();
            });
        }
    }

    renderTagList(allUniqueTags, tagCounts) {
        this.tagListContainer.empty();

        const tagsWithCounts = Array.from(allUniqueTags).map(tag => {
            return {
                tag: tag,
                count: tagCounts.get(tag) || 0
            };
        });

        let filteredTags = tagsWithCounts.filter(item => {
            return item.tag.includes(this.searchQuery);
        });

        if (this.hideEmptyTags && this.selectedTags.size > 0) {
            filteredTags = filteredTags.filter(item => item.count > 0);
        }

        filteredTags.sort((a, b) => {
            if (a.count !== b.count) {
                return b.count - a.count;
            }
            return a.tag.localeCompare(b.tag);
        });

        if (filteredTags.length === 0) {
            this.tagListContainer.createDiv({
                text: this.searchQuery ? "Nenhuma tag encontrada para a pesquisa" : "Nenhuma tag disponível",
                cls: "notes-empty"
            });
            return;
        }

        for (const item of filteredTags) {
            const tagBtn = this.tagListContainer.createEl("button", { cls: "tag-item" });
            const hue = getTagHue(item.tag);
            tagBtn.style.setProperty('--tag-hue', hue.toString());

            const isDisabled = this.selectedTags.size > 0 && item.count === 0;
            if (isDisabled) {
                tagBtn.addClass("tag-disabled");
            }

            tagBtn.createSpan({ text: item.tag, cls: "tag-item-name" });
            tagBtn.createSpan({ text: item.count.toString(), cls: "tag-item-count" });

            tagBtn.addEventListener("click", () => {
                if (isDisabled) return;
                this.selectedTags.add(item.tag);
                this.updateUI();
            });
        }
    }

    renderNotesList(matchingFiles) {
        this.notesListContainer.empty();
        this.notesCountEl.setText(`Notas (${matchingFiles.length})`);

        if (matchingFiles.length === 0) {
            this.notesListContainer.createDiv({
                text: "Nenhuma nota encontrada com essa intersecção.",
                cls: "notes-empty"
            });
            return;
        }

        const sortedFiles = [...matchingFiles];
        sortedFiles.sort((a, b) => {
            switch (this.sortOrder) {
                case "mtime-desc":
                    return b.mtime - a.mtime;
                case "mtime-asc":
                    return a.mtime - b.mtime;
                case "ctime-desc":
                    return b.ctime - a.ctime;
                case "ctime-asc":
                    return a.ctime - b.ctime;
                case "title-asc":
                    return a.file.basename.localeCompare(b.file.basename);
                case "title-desc":
                    return b.file.basename.localeCompare(a.file.basename);
                default:
                    return b.mtime - a.mtime;
            }
        });

        const activeTagsArr = Array.from(this.selectedTags);
        const primaryHue = activeTagsArr.length > 0 ? getTagHue(activeTagsArr[0]) : null;

        for (const item of sortedFiles) {
            const noteEl = this.notesListContainer.createDiv({ cls: "note-item" });

            if (primaryHue !== null) {
                noteEl.style.setProperty('--note-accent-color', `hsl(${primaryHue}, 75%, 50%)`);
            } else {
                const fileTagsArr = Array.from(item.tags);
                if (fileTagsArr.length > 0) {
                    const firstFileTagHue = getTagHue(fileTagsArr[0]);
                    noteEl.style.setProperty('--note-accent-color', `hsl(${firstFileTagHue}, 70%, 50%)`);
                }
            }

            noteEl.createDiv({ text: item.file.basename, cls: "note-title" });
            noteEl.createDiv({ text: item.file.path, cls: "note-path" });

            const mDate = new Date(item.mtime).toLocaleDateString();
            const metaEl = noteEl.createDiv({ cls: "note-meta" });
            metaEl.createSpan({ text: `Modificado: ${mDate}` });
            metaEl.createSpan({ text: `${item.tags.size} tags` });

            noteEl.addEventListener("click", async () => {
                const leaf = this.app.workspace.getMostRecentLeaf();
                if (leaf) {
                    await leaf.openFile(item.file);
                }
            });
        }
    }
}

class TagIntersectionPlugin extends obsidian.Plugin {
    async onload() {
        this.registerView(
            VIEW_TYPE_TAG_INTERSECTION,
            (leaf) => new TagIntersectionView(leaf, this)
        );

        this.addRibbonIcon('hash', 'Explorador de Intersecção de Tags', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-tag-intersection-explorer',
            name: 'Abrir Explorador de Intersecção de Tags',
            callback: () => this.activateView(),
        });

        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                this.refreshActiveViews();
            })
        );

        this.registerEvent(
            this.app.metadataCache.on('resolved', () => {
                this.refreshActiveViews();
            })
        );
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAG_INTERSECTION);
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TAG_INTERSECTION);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            // Open in a central pane (full note width) instead of right sidebar
            const centerLeaf = workspace.getLeaf(true);
            if (centerLeaf) {
                leaf = centerLeaf;
                await leaf.setViewState({
                    type: VIEW_TYPE_TAG_INTERSECTION,
                    active: true,
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    refreshActiveViews() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TAG_INTERSECTION);
        for (const leaf of leaves) {
            if (leaf.view instanceof TagIntersectionView) {
                leaf.view.refreshDataAndUI();
            }
        }
    }
}

module.exports = TagIntersectionPlugin;
