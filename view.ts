import { ItemView, WorkspaceLeaf, TFile, getAllTags } from 'obsidian';
import TagIntersectionPlugin from './main';

export const VIEW_TYPE_TAG_INTERSECTION = "tag-intersection-view";

interface FileIndex {
    file: TFile;
    tags: Set<string>;
    mtime: number;
    ctime: number;
}

export class TagIntersectionView extends ItemView {
    plugin: TagIntersectionPlugin;
    
    // State
    private fileIndex: FileIndex[] = [];
    private selectedTags: Set<string> = new Set();
    private searchQuery: string = "";
    private hideEmptyTags: boolean = false;
    private sortOrder: string = "mtime-desc"; // 'mtime-desc', 'mtime-asc', 'title-asc', 'title-desc'
    private tagSortOrder: string = "alpha-asc"; // 'alpha-asc', 'alpha-desc', 'relation-desc', 'relation-asc'

    // DOM Elements
    private searchInputEl: HTMLInputElement;
    private activeTagsContainer: HTMLElement;
    private tagListContainer: HTMLElement;
    private notesListContainer: HTMLElement;
    private notesCountEl: HTMLElement;
    private hideEmptyToggleEl: HTMLInputElement;
    private sortSelectEl: HTMLSelectElement;
    private tagSortSelectEl: HTMLSelectElement;

    constructor(leaf: WorkspaceLeaf, plugin: TagIntersectionPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_TAG_INTERSECTION;
    }

    getDisplayText(): string {
        return "Intersecção de Tags";
    }

    getIcon(): string {
        return "hash";
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("tag-intersection-container");

        // Build HTML structure
        this.renderLayout(container);

        // Fetch data and build initial UI
        this.refreshDataAndUI();
    }

    async onClose() {
        // Cleanup state
        this.selectedTags.clear();
    }

    /**
     * Re-scans all markdown files in the vault to build a local index of tags,
     * then updates the calculations and refreshes the UI.
     */
    refreshDataAndUI() {
        this.buildFileIndex();
        this.updateUI();
    }

    /**
     * Iterates over all vault markdown files to cache their tags and timestamps
     */
    private buildFileIndex() {
        const files = this.app.vault.getMarkdownFiles();
        this.fileIndex = [];

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            const tagsArray = getAllTags(cache);
            const tagsSet = new Set<string>();

            if (tagsArray) {
                for (const t of tagsArray) {
                    // Normalize tags to lowercase for consistent comparison but keep original?
                    // Obsidian tags are case-insensitive. We'll store them in lowercase for indexing
                    // but maintain their canonical casing (from cache or display) in standard lists.
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

    /**
     * Renders the basic DOM elements shell
     */
    private renderLayout(parent: HTMLElement) {
        // 1. Header
        const header = parent.createDiv({ cls: "tag-intersection-header" });
        header.createEl("h4", { text: "Intersecção de Tags", cls: "tag-intersection-title" });
        header.createEl("p", { 
            text: "Selecione tags para filtrar notas que contêm todas elas.", 
            cls: "tag-intersection-subtitle" 
        });

        // 2. Search Box
        const searchWrapper = parent.createDiv({ cls: "tag-intersection-search-wrapper" });
        
        // Search icon (using native SVG or text fallback, let's use SVG or text)
        const iconSpan = searchWrapper.createSpan({ cls: "tag-intersection-search-icon" });
        iconSpan.innerHTML = `🔎`;

        this.searchInputEl = searchWrapper.createEl("input", {
            type: "text",
            placeholder: "Pesquisar tags...",
            cls: "tag-intersection-search-input"
        });
        
        this.searchInputEl.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
            this.updateUI();
        });

        // 3. Active Tags
        const activeSection = parent.createDiv({ cls: "tag-intersection-active-section" });
        const activeHeader = activeSection.createDiv({ cls: "tag-intersection-active-header" });
        activeHeader.createSpan({ text: "Filtros Ativos" });
        
        const clearBtn = activeHeader.createEl("button", { 
            text: "Limpar", 
            cls: "tag-intersection-clear-btn" 
        });
        clearBtn.addEventListener("click", () => {
            this.selectedTags.clear();
            this.updateUI();
        });

        this.activeTagsContainer = activeSection.createDiv({ cls: "tag-intersection-active-tags" });

        // 4. Section Container for Lists (Tag list & Note list)
        const sectionsWrapper = parent.createDiv({ cls: "tag-intersection-sections" });

        // Available Tags Section
        const tagsSection = sectionsWrapper.createDiv({ cls: "tag-intersection-section" });
        const tagsHeaderWrapper = tagsSection.createDiv({ cls: "tag-intersection-section-title-wrapper" });
        tagsHeaderWrapper.createEl("h5", { text: "Tags Disponíveis", cls: "tag-intersection-section-title" });

        // Hide Empty Toggle
        const toggleLabel = tagsHeaderWrapper.createEl("label", { cls: "tag-intersection-toggle-label" });
        this.hideEmptyToggleEl = toggleLabel.createEl("input", { 
            type: "checkbox", 
            cls: "tag-intersection-toggle-input" 
        });
        toggleLabel.createSpan({ text: "Ocultar vazias" });
        
        this.hideEmptyToggleEl.addEventListener("change", (e) => {
            this.hideEmptyTags = (e.target as HTMLInputElement).checked;
            this.updateUI();
        });

        // Tag Sort Selector
        this.tagSortSelectEl = tagsHeaderWrapper.createEl("select", { cls: "tag-sort-select" });
        this.tagSortSelectEl.createEl("option", { value: "alpha-asc", text: "A → Z" });
        this.tagSortSelectEl.createEl("option", { value: "alpha-desc", text: "Z → A" });
        this.tagSortSelectEl.createEl("option", { value: "relation-desc", text: "Relação (↓)" });
        this.tagSortSelectEl.createEl("option", { value: "relation-asc", text: "Relação (↑)" });

        this.tagSortSelectEl.addEventListener("change", (e) => {
            this.tagSortOrder = (e.target as HTMLSelectElement).value;
            this.updateUI();
        });

        this.tagListContainer = tagsSection.createDiv({ cls: "tag-list-container" });

        // Notes Section
        const notesSection = sectionsWrapper.createDiv({ cls: "tag-intersection-notes-section" });
        const notesHeaderWrapper = notesSection.createDiv({ cls: "tag-intersection-section-title-wrapper" });
        
        this.notesCountEl = notesHeaderWrapper.createEl("h5", { text: "Notas (0)", cls: "tag-intersection-section-title" });

        // Sort Selector
        this.sortSelectEl = notesHeaderWrapper.createEl("select", { cls: "notes-sort-select" });
        this.sortSelectEl.createEl("option", { value: "mtime-desc", text: "Modificação (Novo-Antigo)" });
        this.sortSelectEl.createEl("option", { value: "mtime-asc", text: "Modificação (Antigo-Novo)" });
        this.sortSelectEl.createEl("option", { value: "ctime-desc", text: "Criação (Novo-Antigo)" });
        this.sortSelectEl.createEl("option", { value: "ctime-asc", text: "Criação (Antigo-Novo)" });
        this.sortSelectEl.createEl("option", { value: "title-asc", text: "Título (A-Z)" });
        this.sortSelectEl.createEl("option", { value: "title-desc", text: "Título (Z-A)" });

        this.sortSelectEl.addEventListener("change", (e) => {
            this.sortOrder = (e.target as HTMLSelectElement).value;
            this.updateUI();
        });

        this.notesListContainer = notesSection.createDiv({ cls: "notes-list-container" });
    }

    /**
     * Recalculates intersections, tag counts, and rerenders dynamic components
     */
    private updateUI() {
        // 1. Calculate matching files based on active tags
        const matchingFiles = this.fileIndex.filter(item => {
            return Array.from(this.selectedTags).every(tag => item.tags.has(tag));
        });

        // 2. Render Active Tags Chips
        this.renderActiveTags();

        // 3. Compute tag occurrence counts inside the matching files subset
        const tagCounts = new Map<string, number>();
        
        // Count tags only in the matching subset of files
        for (const item of matchingFiles) {
            for (const tag of item.tags) {
                // If it's already in selected tags, we don't count it for selection (or we keep it)
                if (this.selectedTags.has(tag)) continue;
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }

        // Also add other vault tags that have 0 matches in the current selection, so we can display them (if not hidden)
        const allUniqueTags = new Set<string>();
        for (const item of this.fileIndex) {
            for (const tag of item.tags) {
                if (!this.selectedTags.has(tag)) {
                    allUniqueTags.add(tag);
                }
            }
        }

        // 4. Render Tag List
        // Use total vault files as denominator when no filter is active
        const denominator = this.selectedTags.size > 0 ? matchingFiles.length : this.fileIndex.length;
        this.renderTagList(allUniqueTags, tagCounts, denominator);

        // 5. Render Notes List
        this.renderNotesList(matchingFiles);
    }

    /**
     * Renders active tag chips
     */
    private renderActiveTags() {
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
            chip.createSpan({ text: tag });
            
            const removeIcon = chip.createSpan({ text: "×", cls: "tag-active-chip-remove" });
            removeIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                this.selectedTags.delete(tag);
                this.updateUI();
            });
        }
    }

    /**
     * Renders available tags with counts and relationship percentages
     */
    private renderTagList(allUniqueTags: Set<string>, tagCounts: Map<string, number>, totalMatchingFiles: number) {
        this.tagListContainer.empty();

        const tagsWithData = Array.from(allUniqueTags).map(tag => {
            const count = tagCounts.get(tag) || 0;
            const pct = totalMatchingFiles > 0 ? Math.round((count / totalMatchingFiles) * 100) : 0;
            return { tag, count, pct };
        });

        let filteredTags = tagsWithData.filter(item => item.tag.includes(this.searchQuery));

        if (this.hideEmptyTags && this.selectedTags.size > 0) {
            filteredTags = filteredTags.filter(item => item.count > 0);
        }

        switch (this.tagSortOrder) {
            case "alpha-asc":
                filteredTags.sort((a, b) => a.tag.localeCompare(b.tag));
                break;
            case "alpha-desc":
                filteredTags.sort((a, b) => b.tag.localeCompare(a.tag));
                break;
            case "relation-asc":
                filteredTags.sort((a, b) => a.pct !== b.pct ? a.pct - b.pct : a.tag.localeCompare(b.tag));
                break;
            case "relation-desc":
            default:
                filteredTags.sort((a, b) => a.pct !== b.pct ? b.pct - a.pct : a.tag.localeCompare(b.tag));
                break;
        }

        if (filteredTags.length === 0) {
            this.tagListContainer.createDiv({
                text: this.searchQuery ? "Nenhuma tag encontrada para a pesquisa" : "Nenhuma tag disponível",
                cls: "notes-empty"
            });
            return;
        }

        for (const item of filteredTags) {
            const tagBtn = this.tagListContainer.createEl("button", { cls: "tag-item" });

            const isDisabled = this.selectedTags.size > 0 && item.count === 0;
            if (isDisabled) {
                tagBtn.addClass("tag-disabled");
            }

            tagBtn.createSpan({ text: item.tag, cls: "tag-item-name" });

            const metaSpan = tagBtn.createSpan({ cls: "tag-item-meta" });
            // Relationship bar + percentage (always visible)
            const relWrapper = metaSpan.createSpan({ cls: "tag-item-relation" });
            const bar = relWrapper.createSpan({ cls: "tag-relation-bar" });
            bar.createSpan({ cls: "tag-relation-fill", attr: { style: `width:${item.pct}%` } });
            relWrapper.createSpan({ text: `${item.pct}%`, cls: "tag-relation-pct" });

            tagBtn.addEventListener("click", () => {
                if (isDisabled) return;
                this.selectedTags.add(item.tag);
                this.updateUI();
            });
        }
    }

    /**
     * Sorts and renders matching notes list
     */
    private renderNotesList(matchingFiles: FileIndex[]) {
        this.notesListContainer.empty();
        
        // Update notes count header
        this.notesCountEl.setText(`Notas (${matchingFiles.length})`);

        if (matchingFiles.length === 0) {
            this.notesListContainer.createDiv({ 
                text: "Nenhuma nota encontrada com essa intersecção.", 
                cls: "notes-empty" 
            });
            return;
        }

        // Clone and sort matching files
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

        for (const item of sortedFiles) {
            const noteEl = this.notesListContainer.createDiv({ cls: "note-item" });
            
            noteEl.createDiv({ text: item.file.basename, cls: "note-title" });
            noteEl.createDiv({ text: item.file.path, cls: "note-path" });
            
            // Format dates simply
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
