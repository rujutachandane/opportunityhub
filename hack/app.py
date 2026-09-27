import os
import json
from datetime import datetime, date
from flask import Flask, render_template, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='static', template_folder='templates')

DATA_FILE = os.path.join(os.path.dirname(__file__), 'data', 'opportunities.json')

def load_opportunities():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/opportunities', methods=['GET'])
def get_opportunities():
    data = load_opportunities()
    
    # Query parameters
    search_q = request.args.get('q', '').lower().strip()
    category = request.args.get('category', '').strip()
    mode = request.args.get('mode', '').strip()
    skill = request.args.get('skill', '').strip()
    deadline_filter = request.args.get('deadline', '').strip()
    
    filtered = []
    
    today = date.today()
    
    for item in data:
        # Search filter
        if search_q:
            in_title = search_q in item.get('title', '').lower()
            in_org = search_q in item.get('organization', '').lower()
            in_desc = search_q in item.get('short_description', '').lower()
            in_skills = any(search_q in s.lower() for s in item.get('required_skills', []))
            if not (in_title or in_org or in_desc or in_skills):
                continue
                
        # Category filter
        if category and category.lower() != 'all':
            if item.get('category', '').lower() != category.lower():
                continue
                
        # Mode filter
        if mode and mode.lower() != 'all':
            if item.get('mode', '').lower() != mode.lower():
                continue
                
        # Skill filter
        if skill and skill.lower() != 'all':
            item_skills_lower = [s.lower() for s in item.get('required_skills', [])]
            if skill.lower() not in item_skills_lower:
                continue
                
        # Deadline filter
        if deadline_filter and deadline_filter.lower() != 'all':
            dl_str = item.get('deadline', '')
            if dl_str == 'No Deadline' or not dl_str:
                if deadline_filter.lower() in ['ending_soon', 'this_month']:
                    continue
            else:
                try:
                    dl_date = datetime.strptime(dl_str, '%Y-%m-%d').date()
                    days_left = (dl_date - today).days
                    if deadline_filter.lower() == 'ending_soon':
                        if not (0 <= days_left <= 14):
                            continue
                    elif deadline_filter.lower() == 'this_month':
                        if not (0 <= days_left <= 30):
                            continue
                except ValueError:
                    pass

        filtered.append(item)
        
    return jsonify({
        'success': True,
        'count': len(filtered),
        'total': len(data),
        'opportunities': filtered
    })

@app.route('/api/opportunities/<opp_id>', methods=['GET'])
def get_opportunity_by_id(opp_id):
    data = load_opportunities()
    item = next((x for x in data if x.get('id') == opp_id), None)
    if not item:
        return jsonify({'success': False, 'error': 'Opportunity not found'}), 404
    return jsonify({'success': True, 'opportunity': item})

@app.route('/api/recommendations', methods=['POST'])
def get_recommendations():
    profile = request.json or {}
    user_skills = [s.lower().strip() for s in profile.get('skills', [])]
    user_interests = [i.lower().strip() for i in profile.get('interests', [])]
    user_categories = [c.lower().strip() for c in profile.get('categories', [])]
    user_level = profile.get('education_level', '').lower().strip()
    
    data = load_opportunities()
    scored_items = []
    
    for item in data:
        req_skills = [s.lower().strip() for s in item.get('required_skills', [])]
        matched_skills = [s for s in item.get('required_skills', []) if s.lower().strip() in user_skills]
        
        # Skill Match Score (up to 50 pts)
        skill_score = 0
        if req_skills:
            skill_ratio = len(matched_skills) / len(req_skills)
            skill_score = skill_ratio * 50
        elif user_skills:
            skill_score = 25
            
        # Category Match Score (up to 25 pts)
        category_score = 0
        if item.get('category', '').lower().strip() in user_categories:
            category_score = 25
            
        # Interest & Keywords Match Score (up to 15 pts)
        interest_score = 0
        title_desc = (item.get('title', '') + ' ' + item.get('short_description', '')).lower()
        matched_interests = []
        for interest in user_interests:
            if interest in title_desc or interest in item.get('category', '').lower():
                matched_interests.append(interest)
        if user_interests:
            interest_score = min(15, (len(matched_interests) / max(1, len(user_interests))) * 15)
            
        # Target Education Level Match (up to 10 pts)
        level_score = 0
        target_levels = [t.lower().strip() for t in item.get('target_level', [])]
        if not target_levels or not user_level or user_level in target_levels:
            level_score = 10
            
        total_score = round(skill_score + category_score + interest_score + level_score)
        # Cap at 98% for realistic feeling or min 40 if some matches
        match_percentage = min(98, max(35 if (matched_skills or category_score > 0) else 15, total_score))
        
        item_copy = dict(item)
        item_copy['match_score'] = match_percentage
        item_copy['matched_skills'] = matched_skills
        scored_items.append(item_copy)
        
    # Sort by match_score descending
    scored_items.sort(key=lambda x: x['match_score'], reverse=True)
    
    return jsonify({
        'success': True,
        'count': len(scored_items),
        'recommendations': scored_items
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    data = load_opportunities()
    today = date.today()
    
    ending_soon = 0
    categories_count = {}
    
    for item in data:
        cat = item.get('category', 'Other')
        categories_count[cat] = categories_count.get(cat, 0) + 1
        
        dl_str = item.get('deadline', '')
        if dl_str and dl_str != 'No Deadline':
            try:
                dl_date = datetime.strptime(dl_str, '%Y-%m-%d').date()
                if 0 <= (dl_date - today).days <= 14:
                    ending_soon += 1
            except ValueError:
                pass
                
    return jsonify({
        'success': True,
        'total': len(data),
        'ending_soon': ending_soon,
        'categories': categories_count
    })

if __name__ == '__main__':
    print("Starting OpportunityHub server on http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
