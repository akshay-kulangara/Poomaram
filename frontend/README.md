# 🏠 Poomarathingal Task Manager

A modern, intuitive web application designed to streamline household chore management and promote collaboration among family members in shared living spaces.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 📋 Overview

The Poomarathingal Task Manager helps family members organize household tasks, fairly distribute responsibilities through random assignment, and track completion with accountability features. Built with vanilla JavaScript, HTML5, and CSS3, it requires no backend and stores all data locally in the browser.

## ✨ Features

### 🎯 Core Functionality

- **Task Management**
  - Create, edit, and delete household tasks
  - Categorize tasks (cleaning, cooking, maintenance, pet care, shopping, other)
  - Set priority levels (high, medium, low)
  - Define task frequency and estimated duration
  - Add detailed descriptions

- **Family Member Management**
  - Add and manage family member profiles with photos
  - Track individual statistics and contributions
  - Visual profile pictures for easy identification

- **Random Task Assignment**
  - Intelligent random assignment algorithm
  - Fair distribution across all family members
  - Considers past assignments to ensure fairness
  - One-click assignment for all pending tasks

- **Interactive Dashboard**
  - Real-time statistics overview
  - Current task assignments by family member
  - Recent activity feed with timestamps
  - Visual progress indicators
  - Current date display

- **Task Completion Tracking**
  - Mark tasks as complete with timestamps
  - Required completion notes for accountability
  - Required photo upload for verification
  - Maintain completion history

- **Statistics & Analytics**
  - Task completion charts by family member
  - Category breakdown visualization
  - Detailed performance metrics
  - Completion rate tracking
  - Month-based filtering

- **Notification System**
  - Real-time success/error notifications
  - Activity updates
  - User-friendly feedback

## 🚀 Getting Started

### Prerequisites

- Modern web browser (Chrome, Firefox, Safari, Edge)
- No server or installation required!

### Installation

1. **Download or Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/family-task-manager.git
   cd family-task-manager
   ```

2. **Open the Application**
   - Simply open `index.html` in your web browser
   - Or use a local server:
     ```bash
     # Using Python 3
     python -m http.server 8000
     
     # Using Node.js
     npx serve
     ```
   - Navigate to `http://localhost:8000`

### Quick Start Guide

1. **Add Family Members**
   - Click "Roommates" in the navigation
   - Click "+ Add Roommate"
   - Fill in name and optionally upload a profile picture
   - Save

2. **Create Tasks**
   - Click "Tasks" in the navigation
   - Click "+ Add Task"
   - Select from existing task names or create a new one
   - Set frequency (one-time, daily, weekly, monthly)
   - Set estimated duration in minutes
   - Save

3. **Assign Tasks**
   - Go to "Dashboard"
   - Click "🎲 Assign Tasks Randomly"
   - Tasks are automatically distributed among family members

4. **Complete Tasks**
   - View assigned tasks in Dashboard or Tasks view
   - Click "✓ Complete" on a task
   - Add required completion notes
   - Upload required photo verification
   - Submit completion

5. **View Statistics**
   - Click "Statistics" to see performance metrics
   - View contribution charts
   - Track completion rates

## 📱 User Interface

### Navigation

- **Dashboard**: Overview of current assignments and activity with real-time date
- **Tasks**: Manage all household tasks with filtering options
- **Roommates**: Manage family member profiles with photos
- **Statistics**: View analytics and performance metrics

### Task Filters

Filter tasks by:
- Status (All, Pending, In Progress, Completed)
- Month (All Months, or specific months based on task creation)

## 💾 Data Storage

All data is stored locally in your browser using `localStorage`:
- **Tasks**: All task information and completion data
- **Roommates**: Family member profiles with photos and statistics
- **Activities**: Recent activity history with timestamps
- **Assignments**: Current task assignments with history

**Note**: Data persists across browser sessions but is specific to each browser. Clearing browser data will remove all stored information.

## 🎨 Customization

### Profile Pictures

Each family member can have a profile picture:
- Upload custom photos for easy identification
- Photos are displayed in avatars and task assignments
- Stored locally as base64 encoded images

### Task Categories

Tasks can be categorized and have the following properties:
- **Name**: Reusable task names from dropdown or create new
- **Frequency**: One-time, Daily, Weekly, or Monthly
- **Duration**: Estimated time in minutes
- **Status**: Pending, In Progress, or Completed

## 🔧 Technical Details

### Technology Stack

- **HTML5**: Semantic markup
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **JavaScript (ES6+)**: Vanilla JavaScript, no frameworks
- **Local Storage API**: Client-side data persistence

### Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### File Structure

```
family-task-manager/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All styles (1372 lines)
├── js/
│   └── app.js          # Application logic (1102 lines)
├── images/
│   └── clean.jpeg      # Sample image
└── README.md           # This file
```

## 📊 Features in Detail

### Task Assignment Algorithm

The random assignment algorithm:
1. Filters pending tasks (not completed)
2. Shuffles family member list for fairness
3. Distributes tasks evenly in round-robin fashion
4. Tracks assignment history to prevent repeated assignments
5. Updates assignment statistics
6. Logs activity with timestamps

### Completion Tracking

When completing a task:
- Timestamp is automatically recorded
- Completion notes are required
- Photo upload is required (stored as base64)
- Task status changes to "completed"
- Family member statistics are updated
- Activity is logged with full details

### Statistics Calculation

- **Completion Rate**: (Completed Tasks / Total Assigned) × 100
- **Task Distribution**: Visual bars showing relative workload
- **Category Breakdown**: Count of tasks per category
- **Recent Activity**: Last 50 activities with timestamps

## 🎯 Best Practices

### For Family Members

1. **Regular Updates**: Check the dashboard daily
2. **Timely Completion**: Mark tasks complete promptly with required photos
3. **Photo Verification**: Always upload clear photos for accountability
4. **Detailed Notes**: Provide meaningful completion notes
5. **Fair Distribution**: Use random assignment regularly

### For Task Management

1. **Reuse Task Names**: Select from existing tasks when possible
2. **Realistic Estimates**: Set accurate time estimates in minutes
3. **Appropriate Frequency**: Choose correct frequency (one-time, daily, weekly, monthly)
4. **Regular Review**: Update or remove outdated tasks
5. **Month Filtering**: Use month filter to view tasks by time period

## 🔒 Privacy & Security

- All data is stored locally in your browser using localStorage
- No data is sent to external servers
- No user accounts or authentication required
- Profile pictures and completion photos are stored as base64 in localStorage
- Clear browser data to remove all information
- Data is specific to each browser and device

## 🐛 Troubleshooting

### Data Not Saving

- Check if localStorage is enabled in your browser
- Ensure you're not in private/incognito mode
- Check available storage space

### Photos Not Uploading

- Ensure file is an image format (JPG, PNG, etc.)
- Check file size (large files may exceed storage limits)
- Try a smaller image

### Tasks Not Displaying

- Check filter settings
- Refresh the page
- Clear browser cache if issues persist

## 🚀 Future Enhancements

Potential features for future versions:
- Cloud synchronization across devices
- Mobile app versions (iOS/Android)
- Calendar integration
- Expense splitting and tracking
- Automatic recurring task creation
- Multi-household/family support
- Email/SMS/Push notifications
- Task templates library
- Export/import functionality (JSON/CSV)
- Task priority levels
- Category management
- Advanced filtering options

## 📄 License

This project is licensed under the MIT License - see below for details:

```
MIT License

Copyright (c) 2026 Poomarathingal Task Manager

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 👥 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For questions, issues, or suggestions:
- Open an issue on GitHub
- Check the documentation in this README
- Review the code comments in `js/app.js`

## 🙏 Acknowledgments

- Designed for families, by families
- Built with modern web technologies (vanilla JavaScript, HTML5, CSS3)
- Inspired by the need for fair household task distribution
- No dependencies or frameworks required

---

**Made with ❤️ for better shared living experiences**

Version 1.0.0 | Last Updated: April 2026