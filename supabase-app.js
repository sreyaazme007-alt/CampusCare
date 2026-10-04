(() => {
    const config = window.CAMPUSCARE_SUPABASE;
    let client;

    function getClient() {
        if (!config || config.url.includes("YOUR_") || config.anonKey.includes("YOUR_")) {
            throw new Error("Add your Supabase project URL and anon key to supabase-config.js.");
        }
        if (!client) {
            client = window.supabase.createClient(config.url, config.anonKey);
        }
        return client;
    }

    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.style.display = "block";
        element.style.color = isError ? "#991b1b" : "#166534";
        element.style.background = isError ? "#fee2e2" : "#dcfce7";
        element.setAttribute("role", isError ? "alert" : "status");
    }

    function formatDate(value) {
        return new Date(value).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    async function uploadEvidence(supabase, complaintId, file) {
        if (!file) return null;
        if (file.size > 5 * 1024 * 1024) {
            throw new Error("Choose an image smaller than 5 MB.");
        }
        const extension = file.name.split(".").pop().toLowerCase();
        const path = `${complaintId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage
            .from("complaint-evidence")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        return path;
    }

    async function handleComplaintForm() {
        const form = document.getElementById("complaintForm");
        if (!form) return;

        const message = document.getElementById("successMessage");
        const button = form.querySelector('[type="submit"]');
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            button.disabled = true;
            message.style.display = "none";
            try {
                const supabase = getClient();
                const role = document.body.dataset.role;
                const complaintId = crypto.randomUUID();
                const value = (id) => document.getElementById(id)?.value.trim() || null;
                const imagePath = await uploadEvidence(
                    supabase,
                    complaintId,
                    document.getElementById("image").files[0]
                );
                const { error } = await supabase.from("complaints").insert({
                    id: complaintId,
                    role,
                    name: value("name"),
                    identifier: value("registerNumber") || value("employeeId"),
                    department: value("department"),
                    semester: value("semester"),
                    class_name: value("className"),
                    designation: value("designation"),
                    phone: value("phone"),
                    category: value("category"),
                    description: value("description"),
                    image_path: imagePath
                });
                if (error) throw error;
                form.reset();
                showMessage(message, `Complaint submitted. Save this tracking ID: ${complaintId}`);
            } catch (error) {
                showMessage(message, error.message || "Could not submit your complaint.", true);
            } finally {
                button.disabled = false;
            }
        });
    }

    async function handleTrackingForm() {
        const form = document.getElementById("trackForm");
        if (!form) return;

        const linkedId = new URLSearchParams(window.location.search).get("id");
        if (linkedId) document.getElementById("complaintId").value = linkedId;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const result = document.getElementById("result");
            const errorMessage = document.getElementById("errorMessage");
            result.style.display = "none";
            errorMessage.style.display = "none";
            try {
                const { data, error } = await getClient().rpc("track_complaint", {
                    complaint_id_input: document.getElementById("complaintId").value.trim()
                });
                if (error) throw error;
                if (!data?.length) {
                    errorMessage.textContent = "Complaint not found. Check the tracking ID and try again.";
                    errorMessage.style.display = "block";
                    return;
                }
                const complaint = data[0];
                document.getElementById("displayId").textContent = complaint.complaint_id;
                document.getElementById("displayCategory").textContent = complaint.category;
                document.getElementById("displayDate").textContent = formatDate(complaint.submitted_at);
                document.getElementById("displayStatus").textContent = complaint.status;
                document.getElementById("displayUpdated").textContent = formatDate(complaint.updated_at);
                result.style.display = "block";
            } catch (error) {
                errorMessage.textContent = error.message || "Could not look up this complaint.";
                errorMessage.style.display = "block";
            }
        });
    }

    async function handleLoginForm() {
        const form = document.getElementById("loginForm");
        if (!form) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const errorMessage = document.getElementById("errorMessage");
            const button = form.querySelector('[type="submit"]');
            errorMessage.style.display = "none";
            button.disabled = true;
            try {
                const supabase = getClient();
                const { error } = await supabase.auth.signInWithPassword({
                    email: document.getElementById("username").value.trim(),
                    password: document.getElementById("password").value
                });
                if (error) throw error;
                const { data, error: roleError } = await supabase.rpc("is_authority");
                if (roleError) throw roleError;
                if (!data) {
                    await supabase.auth.signOut();
                    throw new Error("This account is not enabled for authority access.");
                }
                window.location.href = "authority-dashboard.html";
            } catch (error) {
                showMessage(errorMessage, error.message || "Could not sign in.", true);
            } finally {
                button.disabled = false;
            }
        });
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    async function handleComplaintDetails() {
        const form = document.getElementById("updateForm");
        if (!form) return;

        const message = document.getElementById("successMessage");
        const details = document.querySelectorAll(".details-grid .detail-value");
        const complaintId = new URLSearchParams(window.location.search).get("id");
        window.goBack = () => window.location.href = complaintId
            ? "authority-dashboard.html"
            : "index.html";

        if (!complaintId) {
            const pageTitle = document.querySelector(".page-title");
            pageTitle.querySelector("h1").textContent = "Resolved Complaints";
            pageTitle.querySelector("p").textContent = "Recently resolved campus issues";
            document.querySelectorAll(".main > .card").forEach((card) => card.style.display = "none");

            const list = document.createElement("section");
            list.className = "card";
            list.style.display = "block";
            list.innerHTML = "<h2>Resolved Complaints</h2><p>Loading complaints...</p>";
            pageTitle.after(list);
            try {
                const { data, error } = await getClient().rpc("list_resolved_complaints");
                if (error) throw error;
                if (!data.length) {
                    list.innerHTML = "<h2>Resolved Complaints</h2><p>No resolved complaints yet.</p>";
                } else {
                    list.innerHTML = `<h2>Resolved Complaints</h2><table><thead><tr><th>Complaint ID</th><th>Category</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${data.map((complaint) => `
                        <tr>
                            <td><a href="complaint-status.html?id=${encodeURIComponent(complaint.complaint_id)}">${escapeHtml(complaint.complaint_id)}</a></td>
                            <td>${escapeHtml(complaint.category)}</td>
                            <td>${formatDate(complaint.submitted_at)}</td>
                            <td>Resolved</td>
                        </tr>
                    `).join("")}</tbody></table>`;
                }
            } catch (error) {
                list.innerHTML = `<h2>Resolved Complaints</h2><p>${escapeHtml(error.message || "Could not load resolved complaints.")}</p>`;
            }
            return;
        }

        try {
            const supabase = getClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.replace("authority-login.html");
                return;
            }
            const { data: isAuthority, error: roleError } = await supabase.rpc("is_authority");
            if (roleError || !isAuthority) {
                window.location.replace("authority-login.html");
                return;
            }
            const { data: complaint, error } = await supabase.from("complaints")
                .select("*").eq("id", complaintId).single();
            if (error) throw error;

            [
                complaint.id,
                complaint.role,
                complaint.category,
                formatDate(complaint.created_at),
                complaint.status,
                formatDate(complaint.updated_at)
            ].forEach((value, index) => {
                if (index === 4) details[index].querySelector(".current-status").textContent = value;
                else details[index].textContent = value || "Not provided";
            });
            [
                complaint.name,
                complaint.identifier,
                complaint.department,
                complaint.semester,
                complaint.class_name,
                complaint.phone
            ].forEach((value, index) => {
                details[index + 6].textContent = value || "Not provided";
            });
            document.querySelector(".description").textContent = complaint.description;
            document.getElementById("status").value = complaint.status;
            document.getElementById("remarks").value = complaint.authority_remarks || "";

            if (complaint.image_path) {
                const { data: image, error: imageError } = await supabase.storage
                    .from("complaint-evidence").createSignedUrl(complaint.image_path, 60);
                if (imageError) throw imageError;
                const imageElement = document.createElement("img");
                imageElement.src = image.signedUrl;
                imageElement.alt = "Evidence uploaded with the complaint";
                imageElement.style.maxWidth = "100%";
                document.querySelector(".image-box").replaceChildren(imageElement);
            }

            document.querySelectorAll(".main > .card").forEach((card) => card.style.display = "block");

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const { error: updateError } = await supabase.from("complaints").update({
                    status: document.getElementById("status").value,
                    authority_remarks: document.getElementById("remarks").value.trim() || null,
                    updated_at: new Date().toISOString()
                }).eq("id", complaint.id);
                if (updateError) {
                    showMessage(message, updateError.message, true);
                    return;
                }
                showMessage(message, "Complaint updated successfully.");
            });
        } catch (error) {
            showMessage(message, error.message || "Could not load this complaint.", true);
            document.querySelector(".page-title p").textContent = error.message || "Could not load this complaint.";
        }
    }

    async function handleDashboard() {
        const tableBody = document.getElementById("complaintTable");
        if (!tableBody) return;

        const supabase = getClient();
        const complaints = [];
        let selectedComplaint = null;
        const statusClass = (status) => ({
            "Pending": "pending", "In Progress": "progress", "Resolved": "resolved"
        })[status] || "";

        function renderTable() {
            const search = document.getElementById("searchInput").value.trim().toLowerCase();
            const status = document.getElementById("statusFilter").value;
            const category = document.getElementById("categoryFilter").value;
            const filtered = complaints.filter((complaint) =>
                complaint.id.toLowerCase().includes(search) &&
                (status === "All" || complaint.status === status) &&
                (category === "All" || complaint.category === category)
            );
            tableBody.innerHTML = filtered.length ? filtered.map((complaint) => `
                <tr>
                    <td>${escapeHtml(complaint.id)}</td>
                    <td>${escapeHtml(complaint.role)}</td>
                    <td>${escapeHtml(complaint.category)}</td>
                    <td>${formatDate(complaint.created_at)}</td>
                    <td><span class="status ${statusClass(complaint.status)}">${escapeHtml(complaint.status)}</span></td>
                    <td><button class="view-btn" data-complaint-id="${escapeHtml(complaint.id)}">View</button></td>
                </tr>
            `).join("") : '<tr><td colspan="6" style="text-align:center;padding:20px;">No complaints found.</td></tr>';
            tableBody.querySelectorAll("[data-complaint-id]").forEach((button) => {
                button.addEventListener("click", () => viewComplaint(button.dataset.complaintId));
            });
        }

        function updateStatistics() {
            const count = (status) => complaints.filter((complaint) => complaint.status === status).length;
            document.getElementById("totalCount").textContent = complaints.length;
            document.getElementById("pendingCount").textContent = count("Pending");
            document.getElementById("progressCount").textContent = count("In Progress");
            document.getElementById("resolvedCount").textContent = count("Resolved");
            document.getElementById("alertText").textContent = count("Pending")
                ? `${count("Pending")} new complaints require attention.`
                : "No new complaints require attention.";
        }

        function viewComplaint(complaintId) {
            selectedComplaint = complaints.find((complaint) => complaint.id === complaintId);
            if (!selectedComplaint) return;
            document.getElementById("detailId").textContent = selectedComplaint.id;
            document.getElementById("detailName").textContent = selectedComplaint.name;
            document.getElementById("detailRole").textContent = selectedComplaint.role;
            document.getElementById("detailCategory").textContent = selectedComplaint.category;
            document.getElementById("detailPhone").textContent = selectedComplaint.phone;
            document.getElementById("detailDate").textContent = formatDate(selectedComplaint.created_at);
            document.getElementById("detailDescription").textContent = selectedComplaint.description;
            document.getElementById("newStatus").value = selectedComplaint.status;
            document.getElementById("complaintModal").style.display = "flex";
        }

        window.filterComplaints = renderTable;
        window.closeModal = () => {
            document.getElementById("complaintModal").style.display = "none";
        };
        window.updateStatus = async () => {
            if (!selectedComplaint) return;
            const nextStatus = document.getElementById("newStatus").value;
            const { error } = await supabase.from("complaints")
                .update({ status: nextStatus, updated_at: new Date().toISOString() })
                .eq("id", selectedComplaint.id);
            if (error) {
                alert(error.message);
                return;
            }
            selectedComplaint.status = nextStatus;
            selectedComplaint.updated_at = new Date().toISOString();
            window.closeModal();
            renderTable();
            updateStatistics();
        };
        window.logout = async () => {
            if (!confirm("Are you sure you want to logout?")) return;
            await supabase.auth.signOut();
            window.location.href = "authority-login.html";
        };
        document.getElementById("complaintModal").addEventListener("click", (event) => {
            if (event.target === event.currentTarget) window.closeModal();
        });
        document.getElementById("searchInput").addEventListener("input", renderTable);
        document.getElementById("statusFilter").addEventListener("change", renderTable);
        document.getElementById("categoryFilter").addEventListener("change", renderTable);
        document.getElementById("openFullDetails").addEventListener("click", () => {
            if (selectedComplaint) {
                window.location.href = `Complaint-details.html?id=${encodeURIComponent(selectedComplaint.id)}`;
            }
        });

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.replace("authority-login.html");
                return;
            }
            const { data: isAuthority, error: roleError } = await supabase.rpc("is_authority");
            if (roleError || !isAuthority) {
                await supabase.auth.signOut();
                window.location.replace("authority-login.html");
                return;
            }
            const { data, error } = await supabase.from("complaints").select("*").order("created_at", { ascending: false });
            if (error) throw error;
            complaints.push(...data);
            renderTable();
            updateStatistics();
        } catch (error) {
            document.getElementById("alertText").textContent = error.message || "Could not load complaints.";
        }
    }

    handleComplaintForm();
    handleTrackingForm();
    handleLoginForm();
    handleComplaintDetails().catch((error) => {
        const message = document.getElementById("successMessage");
        if (message) showMessage(message, error.message || "Could not load complaint details.", true);
    });
    handleDashboard().catch((error) => {
        const alertText = document.getElementById("alertText");
        if (alertText) alertText.textContent = error.message || "Could not initialize the dashboard.";
    });
})();
