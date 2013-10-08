TestAction = scenario.Action.extend({
    realStart: function() {
        var jqobj = $("<p>"+this.get("name")+"</p>");
        
        var exits = this.get("exits");
        
        if (_.keys(exits).length <= 1) {
            var func = _.bind(this.end, this);
            _.delay(func, 2000);
        }
        else {
            for (var e in exits) {
                jqobj.append("<br/><a href='#'>"+e+"</a>");
            }
            
            var action = this;
            jqobj.children("a").click(function() {
                var exitname = $(this).text();
                $(this).siblings().andSelf().remove();
                action.end(false, exitname);
            });
        }
        $("body").append(jqobj);
    },
    
    realEnd: function() {
    }
});


var scene = new scenario.Scene();

scene.add([
    new TestAction({"scene": scene, 
                    "name": "1"}),
    new TestAction({"scene": scene, 
                    "name": "2"}),
    new TestAction({"scene": scene, 
                    "name": "3"}),
    new TestAction({"scene": scene, 
                    "name": "4",
                    "exits": {
                        "exit1": "5",
                        "exit2": "6"
                    }
                    }),
    new TestAction({"scene": scene, 
                    "name": "5",
                    "exits": {
                        "exit": "7"
                    }
                    }),
    new TestAction({"scene": scene, 
                    "name": "6"}),
    new TestAction({"scene": scene, 
                    "name": "7"}),
    new TestAction({"scene": scene, 
                    "name": "8"}),
    new TestAction({"scene": scene, 
                    "name": "9"}),
    new TestAction({"scene": scene, 
                    "name": "end"})
]);



$(document).ready(function() {
    scene.run();
});