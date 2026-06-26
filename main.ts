import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TagIntersectionView, VIEW_TYPE_TAG_INTERSECTION } from './view';

export default class TagIntersectionPlugin extends Plugin {
    async onload() {
        // Register the custom view creator
        this.registerView(
            VIEW_TYPE_TAG_INTERSECTION,
            (leaf) => new TagIntersectionView(leaf, this)
        );

        // Add a ribbon icon to open the view
        this.addRibbonIcon('hash', 'Explorador de Intersecção de Tags', () => {
            this.activateView();
        });

        // Add a command to the command palette
        this.addCommand({
            id: 'open-tag-intersection-explorer',
            name: 'Abrir Explorador de Intersecção de Tags',
            callback: () => this.activateView(),
        });

        // Register event listeners to refresh the view when metadata changes
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
        // Detach any views of our type when disabling the plugin
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAG_INTERSECTION);
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TAG_INTERSECTION);

        if (leaves.length > 0) {
            // Focus on the first existing leaf
            leaf = leaves[0];
        } else {
            // Create a new leaf in the right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
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

    /**
     * Find all open instances of our view and refresh them
     */
    refreshActiveViews() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TAG_INTERSECTION);
        for (const leaf of leaves) {
            if (leaf.view instanceof TagIntersectionView) {
                leaf.view.refreshDataAndUI();
            }
        }
    }
}
