**Project Plan: Analyzing Legacy vs. Old File Structures**

**Objective**  
The goal is to identify and document subtle differences in file structures, checksums, offsets, and metadata between the old and legacy versions of the game files. This will enable us to develop a unified solution that works for both old and legacy versions.

---

## 1. **Data Collection**

### Gathering Files

- Collect at least **30 file samples** from each version (old and legacy), including:
    - **Successfully loading files** (e.g., from unmodified games)
    - **Files causing errors** when modified
- **Record metadata** for each file:
    - File size, timestamps, version-specific tags, etc.

### Focus Areas for Collection

- Key data types for modding:
    - **Checksums**, headers, file structure
    - Offsets, metadata (e.g., version information)

### Backup & Organize Data

- Keep files organized:
    - Create directories for `legacy_version` and `old_version`
    - Regular backups to ensure integrity

---

## 2. **Tool Setup**

### Hex Editor & Binary Diff Tools

- Use a **Hex Editor** (e.g., HxD or Hex Fiend) for manual inspection:
    - Compare headers, offsets, and structure
    - Identify byte-level differences

### Automated Scripts for Checksums

- Develop Python scripts to extract and compare checksums:
    - Log checksum data and compare values
    - Generate checksum comparison reports

### Diff Tools for File Comparison

- Use **binary diff tools** (e.g., Beyond Compare) to identify:
    - Byte-by-byte differences
    - Shifts in file structure or content

---

## 3. **Analysis Methodology**

### File Comparison

- Start with **simple file comparisons**:
    - Are headers, offsets, and file ends different?

### Checksum Analysis

- Compare checksums:
    - Are checksums stored the same?
    - Are the algorithms or calculations different between versions?

### Metadata Inspection

- Look for **changes in metadata**:
    - Version identifiers, file integrity markers
    - Missing or altered file-specific attributes

### Data Structure Analysis

- Inspect general data layout:
    - Are there new fields? Rearranged fields?

### Anomaly Detection

- Identify unexplained shifts or new patterns in structure, indicating changes in packaging or validation.

---

## 4. **Documentation**

### Annotated Hex Dumps

- Provide annotated hex dumps showing:
    - Differences between old and legacy files
    - Key changes like offset shifts or new headers

### Side-by-Side Comparison Tables

- Tables comparing:
    - File headers, offsets, checksums, metadata fields
    - Ensure clarity for each version’s differences

### Patterns and Flowcharts

- Chart consistent patterns in file structure:
    - Visualize packaging or validation flow for both versions

### Technical Report

- Write a detailed technical report covering:
    - Observed changes
    - Implications for modding tools
    - Future recommendations

---

## 5. **Next Stage Planning**

### Compatibility Layer Design

- Develop a **compatibility layer** to handle both old and legacy versions:
    - Automatically detect file versions
    - Apply version-specific processing and checksum recalculations

### Testing and Validation

- Run tests to ensure:
    - Mod tools work for both versions
    - File integrity is maintained post-modification

---

## 6. **Timeline & Milestones**

|**Milestone**|**Target Date**|
|---|---|
|**Week 1**: Data collection & tool setup|End of Week 1|
|**Week 2**: Initial comparison & pattern identification|End of Week 2|
|**Week 3**: Documentation and review|End of Week 3|
|**Week 4**: Compatibility layer draft & testing plan|End of Week 4|

---

## 7. **Risks & Mitigations**

### Risk: Incomplete Sample Diversity

- **Mitigation**: Collect more diverse files from the community, especially edge cases.

### Risk: Potential Unnoticed Changes

- **Mitigation**: Perform thorough cross-version testing and additional checks.

### Risk: Difficulty in Reverse Engineering New Checksums

- **Mitigation**: Focus on data-driven analysis and community collaboration to uncover checksum patterns.

---

By following this plan, we can systematically analyze the differences in file structures between old and legacy versions and document the findings for future modding tool development.
