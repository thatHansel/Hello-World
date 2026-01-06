import matplotlib.pyplot as plt
import matplotlib.patches as patches

def create_game_map():
    fig, ax = plt.subplots(figsize=(8, 10))
    
    # Grid settings
    rows = 12
    cols = 10
    ax.set_xlim(0, cols)
    ax.set_ylim(0, rows)
    ax.set_xticks(range(cols + 1))
    ax.set_yticks(range(rows + 1))
    ax.grid(True, color='gray', linestyle='--', linewidth=0.5)
    ax.set_aspect('equal')
    
    # Background (Grass)
    ax.add_patch(patches.Rectangle((0, 0), cols, rows, color='#90EE90')) # LightGreen
    
    # Path coordinates (approximate based on snake pattern)
    # Representing path as a list of rects or line segments
    path_cells = []
    
    # Simulating the winding path from top to bottom
    # Segment 1: Top Right to Top Left
    for x in range(1, 9):
        path_cells.append((x, 10))
    # Segment 2: Down
    for y in range(8, 11):
        path_cells.append((1, y))
    # Segment 3: Left to Right
    for x in range(1, 9):
        path_cells.append((x, 7))
    # Segment 4: Down
    for y in range(5, 8):
        path_cells.append((8, y))
    # Segment 5: Right to Left
    for x in range(2, 9):
        path_cells.append((x, 4))
    # Segment 6: Down to Castle
    for y in range(0, 5):
        path_cells.append((2, y))

    # Draw Path
    for (x, y) in path_cells:
        ax.add_patch(patches.Rectangle((x, y), 1, 1, color='#D2B48C')) # Tan/Sand
        
    # Castle Area
    ax.add_patch(patches.Rectangle((1, 0), 3, 1, color='gray'))
    ax.text(2.5, 0.5, "CASTLE", ha='center', va='center', color='white', fontweight='bold')
    
    # Start Area
    ax.text(8.5, 10.5, "START", ha='center', va='center', color='black', fontweight='bold')

    # Tower Placements
    # Spot 1: Central optimal spot
    # Looking at the loops: (3, 8) is a good spot? 
    # Let's pick a spot surrounded by path.
    # (2, 8) is inside the first turn? 
    # (4, 5) is central.
    
    # Placement 1: Center of the map, inside a U-turn
    # In our schematic: (4, 6) is between row 7 and row 4 path?
    # Let's place it at (4, 5.5) visually.
    # A good tile would be (4, 5) or (4, 6).
    # Let's highlight (4, 6)
    tower1_pos = (4.5, 5.5) 
    circle1 = patches.Circle(tower1_pos, 0.4, color='red', alpha=0.8)
    ax.add_patch(circle1)
    ax.text(tower1_pos[0], tower1_pos[1], "1", ha='center', va='center', color='white', fontweight='bold')

    # Placement 2: Near End or Start
    # Let's place it near the end to catch leaks.
    # Path ends at (2,0). A good spot is (3, 1) or (1, 1).
    tower2_pos = (3.5, 1.5)
    circle2 = patches.Circle(tower2_pos, 0.4, color='red', alpha=0.8)
    ax.add_patch(circle2)
    ax.text(tower2_pos[0], tower2_pos[1], "2", ha='center', va='center', color='white', fontweight='bold')

    # Legend
    ax.text(5, 11.5, "Suggested Cannon Placements", ha='center', va='center', fontsize=14, fontweight='bold')
    
    # Instructions
    text_str = (
        "1. Central Cannon: Maximizes splash damage on loops.\n"
        "2. Safety Cannon: Catches enemies near the castle."
    )
    ax.text(5, -1.5, text_str, ha='center', va='center', fontsize=10, bbox=dict(facecolor='white', alpha=0.8))

    plt.axis('off')
    plt.tight_layout()
    plt.savefig('cannon_placement.png', bbox_inches='tight')
    print("Image saved to cannon_placement.png")

if __name__ == "__main__":
    create_game_map()
