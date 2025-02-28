# **Ultimate Guide to Career Creator 3 for The Sims 1**

## **Overview**
Career Creator 3 is a tool designed for modifying and creating careers in *The Sims 1*. It allows users to edit existing jobs, create custom careers, adjust work schedules, modify salary progression, and implement chance cards. Due to limitations in *The Sims 1*, new careers must replace existing ones using a modified `Work.iff` file.

## **Key Features & Capabilities**
- Modify job hours, salaries, and promotion requirements.
- Create entirely new careers by replacing existing ones.
- Customize job descriptions, required skills, and work moods.
- Adjust chance card probabilities and effects.
- Change carpool vehicles for specific jobs.
- Import and export career files for backup and sharing.
- Modify in-game UI elements such as career icons.

---

## **1. File Structure & How Careers Work in The Sims 1**
- **`Work.iff` (ExpansionShared Folder):** Stores all career-related data.
- **`CarPortal.iff` (GameData\Objects Folder):** Controls job-related carpool behavior.
- **`cpanel` (UIGraphics Folder):** Stores career UI elements like job icons.
- **Textures (`.bmp` in GameData\Textures):** Used for career-specific uniforms.

> **Important Note:** Career Creator 3 modifies careers by swapping `Work.iff`, meaning multiple custom careers cannot exist simultaneously unless manually swapped.

---

## **2. User Interface & Functional Breakdown**
### **Menu Bar**
- **File:** Reload, Save, Global Options, Global Texts, Exit.
- **Career:** Import, Export, Backup.
- **Language:** Multiple language support (list available via screenshot).
- **Help:** About.

### **Main Window Layout**
- **Career List (Top Left)**  
  - Displays available careers with two columns: `ID` and `Internal Career Name`.
  - Legacy editions list 21 jobs.
- **Job List (Bottom Left)**  
  - Displays individual jobs within a career, each having an `Internal Job Name`.
  - Jobs always contain 10 levels, starting from `ID 0`.
- **Career Information Panel (Top Right)**  
  - Editable fields:
    - **Internal Career Name**
    - **Career Name**
    - **Male Offer Dialog Text**
    - **Female Offer Dialog Text**
  - Career Icon display with a **Modify Icons** button (allows import/export of both popup and button icons).
- **Job Information Panel (Bottom Right)**  
  - Editable fields:
    - **Male Job Name**
    - **Female Job Name**
    - **Job Description** (supports `\` for new lines)
  - Buttons:
    - **Job Details:** Opens a detailed job editing window.
    - **Chance Cards:** Opens the chance card editor.

---

## **3. Editing Jobs & Work Schedules**
### **Job Details Window**
- **Text Fields:**
  - Internal Name, Male Mesh, Female Mesh, Skin/Texture.
- **Study Points & Friends Needed:**
  - Adjustable values for required **skills** (Cooking, Mechanical, Charisma, Body, Logic, Creativity) and **friends** for promotion.
- **Mood Changes per Hour:**
  - Allows fine-tuning of job impact on needs (Hunger, Comfort, Hygiene, Bladder, Energy, Fun, Social).
- **General Job Information:**
  - **Salary** (editable numeric field).
  - **Begin Time / End Time** (24-hour format).
  - **Car Selection** (drop-down list of carpool options including Jeep, Limo, SUV, Squad Car, etc.).
- **Buttons:** Load Previous, OK, Cancel.

### **Modifying Job Hours**
- **Why Adjust Job Hours?**  
  - Many default careers have rigid schedules that limit gameplay.
  - Shorter shifts allow for more skill-building and social time.
  - Overnight shifts enable unique storytelling opportunities.
- **How to Modify Hours in Career Creator 3:**  
  - Adjust **Begin Time** and **End Time** in the Job Details Window.
  - Ensure the **End Time** does not overlap with another job if using multiple careers.
  - Test schedules in-game to avoid unintended behavior.

---

## **4. Customizing Chance Cards**
### **Chance Cards Window**
- **Text Displayed:**  
  - Large scrollable text box where you define the event description.
- **Item Panel:**  
  - Add/Edit/Delete options for modifying rewards, penalties, or skill boosts.
- **Implementation:**  
  - Career Creator 3 allows setting custom probability rates for chance cards.
  - By default, most careers feature few chance cards—custom careers can add depth by making them a core mechanic.

### **Best Practices for Chance Cards**
- **Use Skill Rewards:**  
  - Allow chance cards to grant small bonuses toward promotion requirements.
- **Balance Risk & Reward:**  
  - Mix beneficial and negative outcomes for more engaging gameplay.
- **Narrative Integration:**  
  - Tie cards to career themes (e.g., a Science Career may have "Experiment Failure" or "Breakthrough Discovery" events).

---

## **5. Best Practices & Troubleshooting**
### **Common Issues & Fixes**
- **Changes Not Saving?**  
  - Run Career Creator 3 as Administrator.
  - Set Compatibility Mode to Windows XP (SP2 or SP3).
- **Game Not Recognizing Custom Career?**  
  - Ensure `Work.iff` is in **ExpansionShared**, not the Downloads folder.
  - If using custom uniforms, verify `.bmp` files are placed directly in **GameData\Textures** (not in subfolders).
- **Multiple Custom Careers?**  
  - Due to `Work.iff` limitations, careers must be swapped manually unless using a mod manager.

### **Tips for Career Modders**
- **Backup Work.iff** before making changes.
- **Use a Spreadsheet** to organize job progression, salaries, and required skills.
- **Test Career Progression** in-game before sharing mods.
- **Document Changes** for community sharing.

---

## **6. Community Impact & Future Modding**
- **Expanding Career Mods:**  
  - Encouraging more role-based jobs (e.g., Medieval, Sci-Fi, Fantasy).
  - Using chance cards for deeper storytelling.
  - Tweaking job hours for better pacing.
- **Future Tools & Compatibility:**  
  - Potential integration with other modding tools.
  - Compatibility research for mods alongside Career Creator 3.
- **Encouraging Collaboration:**  
  - Share findings with the community (ModTheSims, Reddit, forums).
  - Create YouTube tutorials to demonstrate advanced techniques.

---

## **Conclusion**
Career Creator 3 remains one of the most powerful tools for *The Sims 1* career modding. By mastering job customization, modifying schedules, and utilizing chance cards, players can expand gameplay in meaningful ways. Whether adjusting existing jobs or designing entirely new career paths, this guide serves as a reference for unlocking *The Sims 1’s* full potential.
