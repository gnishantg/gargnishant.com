// Mobile Navigation Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(n => n.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navMenu.classList.remove('active');
}));

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Contact form handling
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form data
        const formData = new FormData(this);
        const name = formData.get('name');
        const email = formData.get('email');
        const subject = formData.get('subject');
        const message = formData.get('message');
        
        // Simple validation
        if (!name || !email || !subject || !message) {
            alert('Please fill in all fields');
            return;
        }
        
        // Here you would typically send the data to a server
        // For now, we'll just show a success message
        alert('Thank you for your message! I\'ll get back to you soon.');
        this.reset();
    });
}

// Animate skill bars when they come into view
const observerOptions = {
    threshold: 0.5,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const skillBars = entry.target.querySelectorAll('.skill-progress');
            skillBars.forEach(bar => {
                const width = bar.style.width;
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = width;
                }, 100);
            });
        }
    });
}, observerOptions);

// Observe skill sections
document.querySelectorAll('.skill-category').forEach(section => {
    observer.observe(section);
});

// Add loading animation for images
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('load', function() {
            this.style.opacity = '1';
        });
    });
});

// Add scroll effect to navbar
window.addEventListener('scroll', function() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%)';
        navbar.style.backdropFilter = 'blur(10px)';
    } else {
        navbar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        navbar.style.backdropFilter = 'none';
    }
});

// PROJECT DATA
const projectsData = {
    1: {
        title: 'Hybrid Cloud Migration & Secure Landing Zone Deployment for Financial Enterprise',
        introduction: `As part of a digital transformation initiative, I led the design and deployment of a hybrid cloud infrastructure for a major enterprise client in the finance sector. The client aimed to migrate critical applications from their on-premises datacenter to Microsoft Azure, leveraging cloud scalability while maintaining robust security and compliance. This project involved a greenfield deployment of a Virtual Data Center (VDC) in Azure, executed in a phased manner to ensure minimal disruption and maximum operational continuity.`,
        description: `The solution architecture centered around a secure, scalable Azure landing zone, designed to support both public and private workloads. The landing zone comprised two distinct Virtual Networks (VNets):

<strong>Public VNet (DMZ):</strong>
<ul>
<li>Hosted a highly available (HA) Cisco Network Virtual Appliance (NVA) for advanced traffic sniffing and logging.</li>
<li>All inbound and outbound public traffic was routed through the Cisco NVA using User Defined Routes (UDRs).</li>
<li>The public subnet was configured as a Demilitarized Zone (DMZ), exposing only the Cisco firewall IP to external sources, thereby minimizing the attack surface.</li>
</ul>

<strong>Private VNet:</strong>
<ul>
<li>Dedicated to private traffic originating from the client's on-premises datacenter via a secure VPN tunnel (deployed in East US).</li>
<li>Traffic was routed through a separate Cisco NVA for comprehensive logging and monitoring.</li>
<li>Ensured strict network segmentation and compliance with financial industry regulations.</li>
</ul>

The landing zone was further integrated with additional VNets through peering:
<ul>
<li><strong>Active Directory VNet:</strong> For centralized authentication and identity management.</li>
<li><strong>Spoke/Application VNets:</strong> Deployed across different subscriptions to host various application workloads, ensuring scalability and isolation.</li>
</ul>

The Cisco NVAs acted as the central routing and security enforcement points, directing traffic between the DMZ, private network, and application VNets.`,
        components: ['VPN Tunnel', 'Cisco NVA', 'User Defined Routes (UDRs)', 'Network Security Groups (NSGs)', 'Gateway Subnet', 'VNet Peering', 'Load Balancers', 'Virtual Machines (VMs)'],
        challenges: [
            {
                title: 'Security Compliance',
                problem: 'Meeting SOX and PCI-DSS requirements in the cloud',
                solution: 'Multi-layer security architecture, Continuous compliance monitoring, Automated audit trail generation',
                result: '100% compliance audit success'
            },
            {
                title: 'Application Dependencies',
                problem: 'Complex interdependencies between legacy applications',
                solution: 'Detailed dependency mapping, Phased migration approach, Parallel running during transition',
                result: 'Zero-downtime migration achieved'
            },
            {
                title: 'Change Management',
                problem: 'User resistance to cloud migration',
                solution: 'Comprehensive training program, Gradual rollout with feedback loops, 24/7 support during transition',
                result: '95% user satisfaction score'
            }
        ],
        benefits: {
            endUser: {
                'Application Response Time': '40% faster',
                'System Availability': '99.94% uptime',
                'Remote Access': 'Secure from anywhere',
                'Mobile Access': 'Native mobile app support'
            },
            itTeam: {
                'Automated Monitoring': '90% reduction in manual checks',
                'Centralized Management': 'Single pane of glass',
                'Automated Patching': '95% automation rate',
                'Incident Resolution': '60% faster resolution'
            },
            financial: {
                'Annual Cost Savings': '$540,000',
                'Capital Expenditure Avoidance': '$2.1M',
                'Operational Efficiency Gains': '$300,000/year',
                'Total 3-Year TCO Reduction': '42%'
            },
            operational: {
                'System Availability Improvement': '99.94% vs 99.2%',
                'Disaster Recovery RTO': '4 hours vs 24 hours',
                'Security Incident Response': '15 minutes vs 2 hours'
            }
        }
    }
};

// PROJECT MODAL FUNCTIONALITY
const modal = document.getElementById('projectModal');
const closeModal = document.querySelector('.close-modal');
const projectDetails = document.getElementById('projectDetails');

// Open modal when clicking on project card
document.addEventListener('click', function(e) {
    if (e.target.closest('[data-project-id]') && !e.target.closest('.btn')) {
        const projectId = e.target.closest('[data-project-id]').getAttribute('data-project-id');
        showProjectDetails(projectId);
    }
    
    // View Details button
    if (e.target.closest('.view-details')) {
        e.preventDefault();
        const projectId = e.target.closest('.view-details').getAttribute('data-project-id');
        showProjectDetails(projectId);
    }
});

function showProjectDetails(projectId) {
    const project = projectsData[projectId];
    if (!project) return;
    
    let detailsHTML = `
        <h1>${project.title}</h1>
        
        <h2>Introduction</h2>
        <p>${project.introduction}</p>
        
        <h2>Project Description</h2>
        <p>${project.description}</p>
        
        <h2>Key Components & Technologies</h2>
        <ul>
            ${project.components.map(comp => `<li>${comp}</li>`).join('')}
        </ul>
        
        <h2>Project Challenges & Solutions</h2>
    `;
    
    project.challenges.forEach(challenge => {
        detailsHTML += `
            <h3>${challenge.title}</h3>
            <p><strong>Problem:</strong> ${challenge.problem}</p>
            <p><strong>Solution:</strong> ${challenge.solution}</p>
            <p><strong>Result:</strong> ${challenge.result}</p>
        `;
    });
    
    detailsHTML += `<h2>Benefits & Impact</h2>`;
    
    // End User Benefits
    detailsHTML += `<h3>End User Benefits</h3><div class="project-stats">`;
    Object.entries(project.benefits.endUser).forEach(([label, value]) => {
        detailsHTML += `
            <div class="stat-item">
                <div class="stat-value">${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `;
    });
    detailsHTML += `</div>`;
    
    // IT Team Benefits
    detailsHTML += `<h3>IT Team Benefits</h3><div class="project-stats">`;
    Object.entries(project.benefits.itTeam).forEach(([label, value]) => {
        detailsHTML += `
            <div class="stat-item">
                <div class="stat-value">${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `;
    });
    detailsHTML += `</div>`;
    
    // Financial Impact
    detailsHTML += `<h3>Financial Impact</h3><div class="project-stats">`;
    Object.entries(project.benefits.financial).forEach(([label, value]) => {
        detailsHTML += `
            <div class="stat-item">
                <div class="stat-value">${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `;
    });
    detailsHTML += `</div>`;
    
    // Operational Impact
    detailsHTML += `<h3>Operational Impact</h3><div class="project-stats">`;
    Object.entries(project.benefits.operational).forEach(([label, value]) => {
        detailsHTML += `
            <div class="stat-item">
                <div class="stat-value">${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `;
    });
    detailsHTML += `</div>`;
    
    projectDetails.innerHTML = detailsHTML;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

// Close modal
closeModal.addEventListener('click', () => {
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('show')) {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
});
});