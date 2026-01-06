import matplotlib.pyplot as plt
import matplotlib.patches as patches

def create_improved_game_map():
    fig, ax = plt.subplots(figsize=(8, 10))
    
    # Grid settings (Approximate from screenshot)
    rows = 11
    cols = 9
    ax.set_xlim(0, cols)
    ax.set_ylim(0, rows)
    ax.set_aspect('equal')
    ax.axis('off')
    
    # Background (Grass)
    ax.add_patch(patches.Rectangle((0, 0), cols, rows, color='#7CFC00')) # Lawn Green
    
    # Trees (represented as darker green circles/triangles pattern) - simplified as texture
    # We won't draw every tree, just the base color
    
    # Water Features (Blue)
    # Top Water (Row 8-9 approx, Col 3-6)
    ax.add_patch(patches.Rectangle((3, 8), 3, 1, color='#00BFFF'))
    # Middle Water (Row 5 approx, Col 4-6)
    ax.add_patch(patches.Rectangle((4, 5), 2, 1, color='#00BFFF'))
    # Bottom Right Water (Row 1-3 approx, Col 6-8)
    ax.add_patch(patches.Rectangle((6, 1), 2, 3, color='#00BFFF'))

    # Path (Serpentine Pattern matching visual)
    path_color = '#DEB887' # Burlywood/Tan
    path_cells = []
    
    # Reconstructing path based on visual cues and water obstacles
    # Start Top-Left (0, 9) -> Right
    for x in range(0, 9): path_cells.append((x, 9)) # Row 9 Top
    
    # Turn Down Right Side
    path_cells.append((8, 8))
    
    # Left (Row 7)
    for x in range(2, 9): path_cells.append((x, 7))
    
    # Turn Down (Col 2)
    path_cells.append((2, 6))
    
    # Right (Row 5) - Goes under the top water?
    # Let's adjust. Serpentine usually skips a row.
    # Row 9: Path
    # Row 8: Grass/Water
    # Row 7: Path
    # Row 6: Grass/Water
    # Row 5: Path
    # Row 4: Grass
    # Row 3: Path
    # Row 2: Grass
    # Row 1: Path
    
    # Let's try to match the screenshot's specific turns
    # Top Right seems to have a turn.
    # Let's assume:
    # 1. Start Top-Right (8,9) -> Left to (1,9)
    # 2. Down to (1,7) -> Right to (8,7)
    # 3. Down to (8,5) -> Left to (1,5)
    # 4. Down to (1,3) -> Right to (8,3)
    # 5. Down to (8,1) -> Left to End
    
    # Let's redraw path cells with this logic
    path_cells = []
    # Segment 1 (Top): Leftwards
    for x in range(1, 9): path_cells.append((x, 9))
    # Turn 1: Down Left
    path_cells.append((1, 8))
    # Segment 2: Rightwards
    for x in range(1, 8): path_cells.append((x, 7))
    # Turn 2: Down Right
    path_cells.append((7, 6))
    # Segment 3: Leftwards
    for x in range(2, 8): path_cells.append((x, 5))
    # Turn 3: Down Left
    path_cells.append((2, 4))
    # Segment 4: Rightwards
    for x in range(2, 8): path_cells.append((x, 3))
    # Turn 4: Down Right
    path_cells.append((7, 2))
    # Segment 5: Leftwards (to Castle)
    for x in range(0, 8): path_cells.append((x, 1))

    # Draw Path
    for (x, y) in path_cells:
        ax.add_patch(patches.Rectangle((x, y), 1, 1, color=path_color))

    # Castle Wall (Bottom)
    ax.add_patch(patches.Rectangle((0, 0), cols, 1, color='#696969')) # DimGray
    ax.text(cols/2, 0.5, "WALL / CASTLE", ha='center', va='center', color='white', fontweight='bold')

    # Tower Placements (Red Circles)
    
    # Spot 1: Central optimal spot
    # Looking for a spot inside a U-turn or between parallel paths.
    # (4, 4) is between Row 3 path and Row 5 path. 
    # It hits enemies on Row 5 and Row 3.
    # It is central.
    tower1_pos = (4.5, 4.5)
    ax.add_patch(patches.Circle(tower1_pos, 0.4, color='red', alpha=0.9))
    ax.text(4.5, 4.5, "1", color='white', fontweight='bold', ha='center', va='center')

    # Spot 2: Another high traffic area or cleanup.
    # (2.5, 6.5) - Inside the left turn?
    # Between Row 7 and Row 5 paths? 
    # (4.5, 6.5) hits Row 7 and Row 5.
    
    # Let's place the second one lower down for safety (Cleanup).
    # Near the wall.
    # (3.5, 2.5) hits Row 3 and Row 1 (final stretch).
    tower2_pos = (3.5, 2.5)
    ax.add_patch(patches.Circle(tower2_pos, 0.4, color='red', alpha=0.9))
    ax.text(3.5, 2.5, "2", color='white', fontweight='bold', ha='center', va='center')

    # Add descriptive title
    plt.title("Recommended Cannon Placements", fontsize=16, fontweight='bold', pad=20)
    
    plt.tight_layout()
    plt.savefig('cannon_placement_v2.png', bbox_inches='tight', dpi=100)
    print("Image saved to cannon_placement_v2.png")

if __name__ == "__main__":
    create_improved_game_map()
